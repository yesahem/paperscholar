import { and, eq, schema, sql, type Transaction } from "@repo/db";
import { addIngestionUsage, enqueue } from "../engine/queue";
import type { TaskHandler } from "../engine/tick";
import { ingestionKeys } from "../keys";
import { readJson, requireJson, writeJson } from "../objects";
import {
  attemptRecordSchema,
  currentStepSchema,
  type CheckOutcome,
  type Verification,
} from "../schemas";
import { verifyProblem } from "../verify/verify-problem";
import { findStep, loadIngestion, loadPlan, verifiableStep } from "./common";
import { hashStepFiles } from "./files";
import { loadStepRow } from "./write";

/** What `ingestion_steps.verification` holds: a line per check, for lists. */
export function summariseVerification(verification: Verification) {
  return {
    passed: verification.passed,
    full: verification.full,
    filesHash: verification.filesHash,
    verifiedAt: verification.verifiedAt,
    checks: verification.checks.map((check) => ({
      id: check.id,
      status: check.status,
      reason: check.details[0] ?? null,
    })),
  };
}

/** Queues assembly once no step is still being written or verified. */
export async function assembleWhenSettled(
  tx: Transaction,
  ingestionId: string,
): Promise<void> {
  const rows = await tx.execute<{ open: number }>(sql`
    select count(*)::int as open from ingestion_steps
    where ingestion_id = ${ingestionId} and status in ('pending', 'writing', 'verifying')
  `);
  if ((rows[0]?.open ?? 0) === 0) await enqueue(tx, ingestionId, "assemble");
}

/** Stage 4 (§8) for one step: run its checks and decide verified, repair or needs attention. */
export const verifyTask: TaskHandler = async (context) => {
  const { deps, task } = context;
  const stepId = task.key;
  const row = await loadIngestion(context);
  const plan = await loadPlan(context);
  const step = findStep(plan, stepId);
  const keys = ingestionKeys(row.id);
  const current = await requireJson(
    deps.storage,
    keys.current(stepId),
    currentStepSchema,
  );

  const report = await verifyProblem(verifiableStep(row.id, step, current.files), {
    provider: deps.sandbox,
    signal: context.signal,
  });
  const checks: CheckOutcome[] = report.checks.map((check) => ({ ...check }));
  const verification: Verification = {
    passed: report.passed,
    full: false,
    checks,
    sandboxRuns: report.runs,
    durationMs: report.durationMs,
    verifiedAt: context.now().toISOString(),
    filesHash: hashStepFiles(current.files),
  };

  if (current.attempt !== null) {
    const record = await readJson(
      deps.storage,
      keys.attempt(stepId, current.attempt),
      attemptRecordSchema,
    );
    if (record)
      await writeJson(deps.storage, keys.attempt(stepId, current.attempt), {
        ...record,
        verification,
      });
  }
  await writeJson(deps.storage, keys.current(stepId), { ...current, verification });
  await addIngestionUsage(deps.db, row.id, { sandboxRuns: report.runs });

  return async (tx) => {
    const stepRow = await loadStepRow(context, stepId);
    const automatic = row.status === "writing";
    const status = verification.passed
      ? "verified"
      : !automatic
        ? "edited"
        : stepRow.attempts < deps.settings.writeAttempts
          ? "writing"
          : "needs_attention";
    await tx
      .update(schema.ingestionSteps)
      .set({
        status,
        verification: summariseVerification(verification),
        updatedAt: context.now(),
      })
      .where(
        and(
          eq(schema.ingestionSteps.ingestionId, row.id),
          eq(schema.ingestionSteps.stepId, stepId),
        ),
      );
    if (!automatic) return;
    if (status === "writing") await enqueue(tx, row.id, "write", stepId);
    else await assembleWhenSettled(tx, row.id);
  };
};
