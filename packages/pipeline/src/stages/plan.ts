import { desc, eq, schema } from "@repo/db";
import { enqueue } from "../engine/queue";
import type { TaskHandler } from "../engine/tick";
import { ingestionKeys } from "../keys";
import { LlmError } from "../llm/types";
import { requireJson, writeJson } from "../objects";
import { PROMPTS, render } from "../prompts";
import {
  addStepRequestSchema,
  checkPlan,
  planSchema,
  planStepSchema,
  type IngestionOptions,
  type Plan,
} from "../schemas";
import {
  callModel,
  documentFor,
  loadIngestion,
  loadOutline,
  loadPlan,
  optionsOf,
} from "./common";

/** One retry inside the task when the plan breaks a rule the schema cannot express. */
const PLAN_CALLS = 2;

function describeOptions(options: IngestionOptions): string {
  const lines: string[] = [];
  if (options.environment) {
    lines.push(`- Every step must use the \`${options.environment}\` environment.`);
  }
  if (options.focus) {
    lines.push(
      `- The maintainer asked you to focus on this: ${JSON.stringify(options.focus)}`,
    );
  }
  return lines.length === 0
    ? "The maintainer gave no special instructions."
    : `The maintainer's instructions:\n\n${lines.join("\n")}`;
}

/** Rules the maintainer's options add on top of `checkPlan`. */
function optionProblems(plan: Plan, options: IngestionOptions): string[] {
  if (!options.environment) return [];
  return plan.steps
    .filter((step) => step.environment !== options.environment)
    .map(
      (step) =>
        `${step.id} uses ${step.environment}; every step must use ${options.environment}`,
    );
}

/**
 * A step a maintainer asked for in a sentence (§10): the planner designs it
 * against the existing plan, then stages 3–4 run for it.
 */
const addStepTask: TaskHandler = async (context) => {
  const { deps, task } = context;
  const row = await loadIngestion(context);
  const keys = ingestionKeys(row.id);
  const [outline, plan, request] = await Promise.all([
    loadOutline(context),
    loadPlan(context),
    requireJson(deps.storage, keys.addStep(task.key), addStepRequestSchema),
  ]);
  const document = await documentFor(context, row);
  const step = await callModel(context, {
    purpose: "plan",
    subject: null,
    system: PROMPTS.system,
    document,
    context: [JSON.stringify(outline)],
    prompt: render(PROMPTS.addStep, {
      description: request.description,
      plan: JSON.stringify(plan, null, 2),
    }),
    schema: planStepSchema,
    schemaName: "plan_step",
    effort: "high",
    maxTokens: 16_000,
  });
  const extended: Plan = { ...plan, steps: [...plan.steps, step] };
  const problems = checkPlan(extended, outline, { min: 1, max: deps.settings.maxSteps });
  if (problems.length > 0) {
    throw new LlmError(
      "invalid_output",
      `the new step broke the plan's rules: ${problems.join("; ")}`,
    );
  }
  await writeJson(deps.storage, keys.plan, extended);

  return async (tx) => {
    const [last] = await tx
      .select({ position: schema.ingestionSteps.position })
      .from(schema.ingestionSteps)
      .where(eq(schema.ingestionSteps.ingestionId, row.id))
      .orderBy(desc(schema.ingestionSteps.position))
      .limit(1);
    await tx
      .insert(schema.ingestionSteps)
      .values({
        ingestionId: row.id,
        stepId: step.id,
        position: (last?.position ?? -1) + 1,
        title: step.title,
      })
      .onConflictDoNothing();
    await enqueue(tx, row.id, "write", step.id);
  };
};

/** Stage 2 (§6): the ordered learning path; with a key, one added step. */
export const planTask: TaskHandler = async (context) => {
  if (context.task.key !== "") return addStepTask(context);
  const { deps } = context;
  const row = await loadIngestion(context);
  const options = optionsOf(row);
  const outline = await loadOutline(context);
  const document = await documentFor(context, row);
  const range = { min: deps.settings.minSteps, max: deps.settings.maxSteps };
  const prompt = render(PROMPTS.plan, {
    options: describeOptions(options),
    targetSteps: String(options.targetSteps ?? `${range.min}–${Math.min(range.max, 8)}`),
    minSteps: String(range.min),
    maxSteps: String(range.max),
  });

  let feedback = "";
  let plan: Plan | null = null;
  let problems: string[] = [];
  for (let call = 1; call <= PLAN_CALLS && plan === null; call += 1) {
    const candidate = await callModel(context, {
      purpose: "plan",
      subject: null,
      system: PROMPTS.system,
      document,
      context: [JSON.stringify(outline)],
      prompt: `${prompt}${feedback}`,
      schema: planSchema,
      schemaName: "plan",
      effort: "high",
      maxTokens: 32_000,
    });
    problems = [
      ...checkPlan(candidate, outline, range),
      ...optionProblems(candidate, options),
    ];
    if (problems.length === 0) plan = candidate;
    else
      feedback = `\n\nYour previous plan broke these rules; fix them:\n\n${problems.map((problem) => `- ${problem}`).join("\n")}`;
  }
  if (plan === null) {
    throw new LlmError(
      "invalid_output",
      `the plan broke its rules: ${problems.join("; ")}`,
    );
  }
  const accepted = plan;
  await writeJson(deps.storage, ingestionKeys(row.id).plan, accepted);

  return async (tx) => {
    const now = context.now();
    await tx
      .insert(schema.ingestionSteps)
      .values(
        accepted.steps.map((step, position) => ({
          ingestionId: row.id,
          stepId: step.id,
          position,
          title: step.title,
        })),
      )
      .onConflictDoNothing();
    if (options.pauseAfterPlan) {
      await tx
        .update(schema.ingestions)
        .set({ status: "awaiting_plan_review", updatedAt: now })
        .where(eq(schema.ingestions.id, row.id));
      return;
    }
    await tx
      .update(schema.ingestions)
      .set({ status: "writing", updatedAt: now })
      .where(eq(schema.ingestions.id, row.id));
    for (const step of accepted.steps) await enqueue(tx, row.id, "write", step.id);
  };
};
