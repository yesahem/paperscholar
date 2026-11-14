import { and, eq, schema } from "@repo/db";
import { enqueue } from "../engine/queue";
import type { TaskContext, TaskHandler } from "../engine/tick";
import { PermanentTaskError } from "../errors";
import { ingestionKeys } from "../keys";
import { readJson, writeJson } from "../objects";
import { PROMPTS, render } from "../prompts";
import {
  attemptRecordSchema,
  writeAnswerSchema,
  type AttemptRecord,
  type CurrentStep,
  type Plan,
  type PlanStep,
} from "../schemas";
import { MIN_HIDDEN_TESTS, PUBLIC_TEST_RANGE } from "../verify/verify-problem";
import {
  callModel,
  documentFor,
  findStep,
  loadIngestion,
  loadOutline,
  loadPlan,
  normaliseFiles,
} from "./common";

export async function loadStepRow(context: TaskContext, stepId: string) {
  const [row] = await context.deps.db
    .select()
    .from(schema.ingestionSteps)
    .where(
      and(
        eq(schema.ingestionSteps.ingestionId, context.task.ingestionId),
        eq(schema.ingestionSteps.stepId, stepId),
      ),
    );
  if (!row) throw new PermanentTaskError(`step ${stepId} has no state row`);
  return row;
}

function describeDependencies(plan: Plan, step: PlanStep): string {
  if (step.dependsOn.length === 0) {
    return "This step depends on no earlier step, so `helpers` is null.";
  }
  const lines = step.dependsOn.map((id) => {
    const dependency = findStep(plan, id);
    return `- \`${dependency.id}\`: \`${dependency.signature}\` — ${dependency.summary}`;
  });
  return `This step builds on earlier steps. Their functions, which \`helpers\` must provide and the description must document:\n\n${lines.join("\n")}`;
}

/** Evidence of a failed verification, as the writer sees it on a repair. */
export function describeEvidence(record: AttemptRecord): string {
  const failed =
    record.verification?.checks.filter((check) => check.status === "failed") ?? [];
  if (failed.length === 0) return "(no failed checks were recorded)";
  return failed
    .map(
      (check) =>
        `- ${check.id} ${check.name}:\n${check.details.map((detail) => `  - ${detail}`).join("\n")}`,
    )
    .join("\n");
}

/** Stage 3 (§7) for one step: its first attempt, or a repair of the last one. */
export const writeTask: TaskHandler = async (context) => {
  const { deps, task } = context;
  const stepId = task.key;
  const row = await loadIngestion(context);
  const [plan, outline] = await Promise.all([loadPlan(context), loadOutline(context)]);
  const step = findStep(plan, stepId);
  const stepRow = await loadStepRow(context, stepId);
  const keys = ingestionKeys(row.id);

  const attempt = stepRow.attempts + 1;
  if (attempt > deps.settings.writeAttempts) {
    return async (tx) => {
      await tx
        .update(schema.ingestionSteps)
        .set({ status: "needs_attention", updatedAt: context.now() })
        .where(
          and(
            eq(schema.ingestionSteps.ingestionId, row.id),
            eq(schema.ingestionSteps.stepId, stepId),
          ),
        );
    };
  }

  await deps.db
    .update(schema.ingestionSteps)
    .set({ status: "writing", updatedAt: context.now() })
    .where(
      and(
        eq(schema.ingestionSteps.ingestionId, row.id),
        eq(schema.ingestionSteps.stepId, stepId),
      ),
    );

  const previous =
    attempt > 1
      ? await readJson(
          deps.storage,
          keys.attempt(stepId, attempt - 1),
          attemptRecordSchema,
        )
      : null;
  let prompt = render(PROMPTS.write, {
    position: String(stepRow.position + 1),
    stepId,
    step: JSON.stringify(step, null, 2),
    dependencies: describeDependencies(plan, step),
    publicTests: `${PUBLIC_TEST_RANGE.min} to ${PUBLIC_TEST_RANGE.max}`,
    hiddenTests: String(MIN_HIDDEN_TESTS),
    entryPoint: step.entryPoint,
  });
  if (previous) {
    prompt += `\n\n${render(PROMPTS.repair, {
      files: JSON.stringify(previous.files, null, 2),
      evidence: describeEvidence(previous),
    })}`;
  }

  const document = await documentFor(context, row);
  const answer = await callModel(context, {
    purpose: "write",
    subject: stepId,
    system: PROMPTS.system,
    document,
    context: [JSON.stringify(outline), JSON.stringify(plan)],
    prompt,
    schema: writeAnswerSchema,
    schemaName: "step_files",
    effort: "high",
    maxTokens: 64_000,
  });

  const files = normaliseFiles(answer.files);
  const writtenAt = context.now().toISOString();
  const record: AttemptRecord = {
    stepId,
    attempt,
    writtenAt,
    instructions: previous ? "repair after failed verification" : null,
    notes: answer.notes,
    files,
    verification: null,
  };
  const current: CurrentStep = {
    stepId,
    attempt,
    updatedAt: writtenAt,
    files,
    verification: null,
  };
  await writeJson(deps.storage, keys.attempt(stepId, attempt), record);
  await writeJson(deps.storage, keys.current(stepId), current);

  return async (tx) => {
    await tx
      .update(schema.ingestionSteps)
      .set({
        status: "verifying",
        attempts: attempt,
        verification: null,
        updatedAt: context.now(),
      })
      .where(
        and(
          eq(schema.ingestionSteps.ingestionId, row.id),
          eq(schema.ingestionSteps.stepId, stepId),
        ),
      );
    await enqueue(tx, row.id, "verify", stepId);
  };
};
