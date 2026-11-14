import { and, eq, schema, sql, type Transaction } from "@repo/db";
import { addIngestionUsage, enqueue } from "../engine/queue";
import type { TaskContext, TaskHandler } from "../engine/tick";
import { ingestionKeys } from "../keys";
import { readJson, requireJson, writeJson } from "../objects";
import { waiverSchema } from "@repo/shared";
import { z } from "zod";
import {
  attemptRecordSchema,
  currentStepSchema,
  type CheckOutcome,
  type FidelityIssue,
  type MutantResult,
  type PlanStep,
  type SolveResult,
  type StepFiles,
  type Verification,
} from "../schemas";
import { verifyProblem } from "../verify/verify-problem";
import {
  findStep,
  loadIngestion,
  loadPlan,
  verifiableStep,
  type IngestionRow,
} from "./common";
import {
  checkFidelity,
  checkIndependentSolve,
  checkMutants,
  skipped,
} from "./model-checks";
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

/** The checks a maintainer waived for this step, with a written reason (§11). */
export function waivedChecks(waivers: unknown): Set<string> {
  const parsed = z.array(waiverSchema).safeParse(waivers);
  return new Set(parsed.success ? parsed.data.map((waiver) => waiver.check) : []);
}

/**
 * Every check of §8 on one step's files. The quick checks (V1–V6, V10) run
 * first; the model-backed ones (V7–V9) only when those pass, so a broken step
 * costs no tokens. A waived V7 or V8 that fails is recorded as waived.
 */
export async function runChecks(
  context: TaskContext,
  row: IngestionRow,
  step: PlanStep,
  files: StepFiles,
  waived: ReadonlySet<string>,
  { full = true }: { full?: boolean } = {},
): Promise<Verification> {
  const started = performance.now();
  const problem = verifiableStep(row.id, step, files);
  const report = await verifyProblem(problem, {
    provider: context.deps.sandbox,
    signal: context.signal,
  });
  const checks: CheckOutcome[] = report.checks.map((check) => ({ ...check }));
  let sandboxRuns = report.runs;
  let mutants: MutantResult[] | null = null;
  let solve: SolveResult | null = null;
  let fidelity: FidelityIssue[] | null = null;

  if (full && report.passed) {
    const v7 = await checkMutants(context, row, step, files, problem);
    const v8 = await checkIndependentSolve(context, step, files, problem);
    const v9 = await checkFidelity(context, row, step, files);
    checks.push(v7.check, v8.check, v9.check);
    sandboxRuns += v7.sandboxRuns + v8.sandboxRuns + v9.sandboxRuns;
    mutants = v7.evidence;
    solve = v8.evidence;
    fidelity = v9.evidence;
  } else if (full) {
    const reason = "not run: an earlier check failed";
    checks.push(skipped("V7", reason), skipped("V8", reason), skipped("V9", reason));
  }

  const final = checks.map((check) =>
    check.status === "failed" && waived.has(check.id)
      ? { ...check, status: "waived" as const }
      : check,
  );
  return {
    passed: final.every((check) => check.status !== "failed") && report.passed,
    full,
    checks: final,
    sandboxRuns,
    durationMs: Math.round(performance.now() - started),
    verifiedAt: context.now().toISOString(),
    filesHash: hashStepFiles(files),
    mutants,
    solve,
    fidelity,
  };
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

  const stepRow = await loadStepRow(context, stepId);
  const verification = await runChecks(
    context,
    row,
    step,
    current.files,
    waivedChecks(stepRow.waivers),
  );

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
  await addIngestionUsage(deps.db, row.id, { sandboxRuns: verification.sandboxRuns });

  return async (tx) => {
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
