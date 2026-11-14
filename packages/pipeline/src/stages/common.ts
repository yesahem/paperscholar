import { eq, schema } from "@repo/db";
import type { RunEnvironment } from "@repo/shared";
import type { z } from "zod";
import { addIngestionUsage } from "../engine/queue";
import type { TaskContext } from "../engine/tick";
import { PermanentTaskError } from "../errors";
import { LlmError, type LlmRequest } from "../llm/types";
import { requireJson } from "../objects";
import { ingestionKeys } from "../keys";
import {
  ingestionOptionsSchema,
  outlineSchema,
  planSchema,
  usageSchema,
  type IngestionOptions,
  type Outline,
  type Plan,
  type PlanStep,
  type StepFiles,
} from "../schemas";
import type { VerifiableProblem } from "../verify/types";

export type IngestionRow = typeof schema.ingestions.$inferSelect;

/** Per-test limits of generated steps, by environment (as for the hand-written papers). */
export const STEP_LIMITS: Record<
  RunEnvironment,
  { timeLimitSeconds: number; memoryLimitMb: number }
> = {
  numpy: { timeLimitSeconds: 2, memoryLimitMb: 256 },
  torch: { timeLimitSeconds: 10, memoryLimitMb: 1024 },
};

export async function loadIngestion(context: TaskContext): Promise<IngestionRow> {
  const [row] = await context.deps.db
    .select()
    .from(schema.ingestions)
    .where(eq(schema.ingestions.id, context.task.ingestionId));
  if (!row) throw new PermanentTaskError("the ingestion no longer exists");
  return row;
}

export function optionsOf(row: IngestionRow): IngestionOptions {
  return ingestionOptionsSchema.parse(row.options);
}

export const loadOutline = (context: TaskContext): Promise<Outline> =>
  requireJson(
    context.deps.storage,
    ingestionKeys(context.task.ingestionId).outline,
    outlineSchema,
  );

export const loadPlan = (context: TaskContext): Promise<Plan> =>
  requireJson(
    context.deps.storage,
    ingestionKeys(context.task.ingestionId).plan,
    planSchema,
  );

export function findStep(plan: Plan, stepId: string): PlanStep {
  const step = plan.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new PermanentTaskError(`step ${stepId} is not in the plan`);
  return step;
}

/** The PDF's file id with the model provider; uploads it on first use. */
export async function documentFor(
  context: TaskContext,
  row: IngestionRow,
): Promise<{ fileId: string }> {
  if (row.llmFileId) return { fileId: row.llmFileId };
  const { deps } = context;
  const source = await deps.storage.get(ingestionKeys(row.id).source);
  if (!source) throw new PermanentTaskError("the uploaded PDF is missing from storage");
  const { fileId } = await deps.llm.uploadPdf({
    bytes: source.body,
    filename: `${row.id}.pdf`,
  });
  await deps.db
    .update(schema.ingestions)
    .set({ llmFileId: fileId, updatedAt: context.now() })
    .where(eq(schema.ingestions.id, row.id));
  return { fileId };
}

/**
 * Calls the model with the ingestion's budget checked first and its usage
 * recorded at once, even when the call fails, so retries are paid for honestly.
 */
export async function callModel<Schema extends z.ZodType>(
  context: TaskContext,
  request: Omit<LlmRequest<Schema>, "signal">,
): Promise<z.output<Schema>> {
  const { deps, task } = context;
  const [row] = await deps.db
    .select({ usage: schema.ingestions.usage })
    .from(schema.ingestions)
    .where(eq(schema.ingestions.id, task.ingestionId));
  const spent = usageSchema.parse(row?.usage ?? {}).outputTokens;
  if (spent >= deps.settings.outputTokenBudget) {
    throw new PermanentTaskError(
      `the output-token budget of ${deps.settings.outputTokenBudget.toLocaleString("en")} is spent (${spent.toLocaleString("en")} used)`,
    );
  }
  try {
    const result = await deps.llm.generate({ ...request, signal: context.signal });
    await addIngestionUsage(deps.db, task.ingestionId, result.usage);
    return result.value;
  } catch (error) {
    if (error instanceof LlmError)
      await addIngestionUsage(deps.db, task.ingestionId, error.usage);
    throw error;
  }
}

/** A planned step with its files, in the shape verification takes. */
export function verifiableStep(
  ingestionId: string,
  step: PlanStep,
  files: StepFiles,
): VerifiableProblem {
  return {
    ref: `${ingestionId.slice(0, 8)}/${step.id}`,
    entryPoint: step.entryPoint,
    environment: step.environment,
    allowedPackages: step.allowedPackages,
    prohibitedImports: step.prohibitedImports,
    ...STEP_LIMITS[step.environment],
    description: files.description,
    tutorial: files.tutorial,
    starter: files.starter,
    solution: files.solution,
    helpers: files.helpers,
    testsPublic: files.testsPublic,
    testsHidden: files.testsHidden,
  };
}

/** Python and Markdown files end with exactly one newline. */
export function normaliseFiles(files: StepFiles): StepFiles {
  const tidy = (text: string) => `${text.replace(/\r\n/g, "\n").trimEnd()}\n`;
  return {
    description: tidy(files.description),
    tutorial: tidy(files.tutorial),
    starter: tidy(files.starter),
    solution: tidy(files.solution),
    testsPublic: tidy(files.testsPublic),
    testsHidden: tidy(files.testsHidden),
    helpers:
      files.helpers === null || files.helpers.trim() === "" ? null : tidy(files.helpers),
  };
}
