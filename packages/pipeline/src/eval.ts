import { asc, eq, schema } from "@repo/db";
import { z } from "zod";
import type { PipelineDeps } from "./deps";
import { ingestionKeys } from "./keys";
import { readJson } from "./objects";
import { attemptRecordSchema, currentStepSchema, ingestionUsageSchema } from "./schemas";

/** The eval set: reference papers by name and source (`arxiv:<id>` or a PDF path). */
export const evalSetSchema = z.object({
  papers: z
    .array(z.object({ name: z.string().min(1), source: z.string().min(1) }))
    .min(1),
});
export type EvalSet = z.infer<typeof evalSetSchema>;

/**
 * The project's reference papers (docs/specs/09-paper-pipeline.md §18). Each has
 * hand-written steps in `content/` to compare with. arXiv sources only: the
 * eval runs on the server, from the CMS.
 */
export const DEFAULT_EVAL_SET: EvalSet = {
  papers: [
    { name: "attention-is-all-you-need", source: "arxiv:1706.03762" },
    { name: "adam", source: "arxiv:1412.6980" },
  ],
};

/** The measures of docs/specs/09-paper-pipeline.md §18 for one ingestion. */
export interface IngestionMeasures {
  ingestionId: string;
  status: string;
  steps: number;
  /** Share of steps verified without repair. */
  firstAttemptVerificationRate: number | null;
  /** Share of steps the pipeline could not finish. */
  needsAttentionRate: number | null;
  /** Killed over killed and surviving mutants, on first attempts. Equivalent and invalid ones are left out. */
  mutationKillRate: number | null;
  /** Share of first attempts the independent solver passed, where it ran. */
  independentSolveRate: number | null;
  /** Steps a maintainer edited by hand. */
  reviewerEdits: number;
  /** Output tokens over verified steps; input tokens (all kinds) over verified steps. */
  outputTokensPerStep: number | null;
  inputTokensPerStep: number | null;
  calls: number;
  sandboxRuns: number;
}

const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);

/** Reads an ingestion's attempts and usage and computes its measures. */
export async function measureIngestion(
  deps: PipelineDeps,
  ingestionId: string,
): Promise<IngestionMeasures> {
  const [row] = await deps.db
    .select()
    .from(schema.ingestions)
    .where(eq(schema.ingestions.id, ingestionId));
  if (!row) throw new Error(`no ingestion ${ingestionId}`);
  const steps = await deps.db
    .select()
    .from(schema.ingestionSteps)
    .where(eq(schema.ingestionSteps.ingestionId, ingestionId))
    .orderBy(asc(schema.ingestionSteps.position));
  const keys = ingestionKeys(ingestionId);

  let firstPassed = 0;
  let killed = 0;
  let survived = 0;
  let solved = 0;
  let solveRuns = 0;
  let edited = 0;
  for (const step of steps) {
    const [first, current] = await Promise.all([
      readJson(deps.storage, keys.attempt(step.stepId, 1), attemptRecordSchema),
      readJson(deps.storage, keys.current(step.stepId), currentStepSchema),
    ]);
    const verification = first?.verification;
    if (verification?.passed) firstPassed += 1;
    for (const mutant of verification?.mutants ?? []) {
      if (mutant.outcome === "killed") killed += 1;
      if (mutant.outcome === "survived") survived += 1;
    }
    if (verification?.solve) {
      solveRuns += 1;
      if (verification.solve.passed && verification.solve.attempts === 1) solved += 1;
    }
    if (current && current.attempt === null) edited += 1;
  }
  const usage = ingestionUsageSchema.parse(row.usage);
  const verified = steps.filter((step) => step.status === "verified").length;
  return {
    ingestionId,
    status: row.status,
    steps: steps.length,
    firstAttemptVerificationRate: ratio(firstPassed, steps.length),
    needsAttentionRate: ratio(
      steps.filter((step) => step.status === "needs_attention").length,
      steps.length,
    ),
    mutationKillRate: ratio(killed, killed + survived),
    independentSolveRate: ratio(solved, solveRuns),
    reviewerEdits: edited,
    outputTokensPerStep:
      verified === 0 ? null : Math.round(usage.outputTokens / verified),
    inputTokensPerStep:
      verified === 0
        ? null
        : Math.round(
            (usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens) /
              verified,
          ),
    calls: usage.calls,
    sandboxRuns: usage.sandboxRuns,
  };
}

/** Averages each rate over the papers that have it, and sums the counts. */
export function summariseMeasures(all: IngestionMeasures[]) {
  const mean = (pick: (measures: IngestionMeasures) => number | null) => {
    const values = all.map(pick).filter((value): value is number => value !== null);
    return values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  return {
    papers: all.length,
    steps: all.reduce((sum, measures) => sum + measures.steps, 0),
    firstAttemptVerificationRate: mean(
      (measures) => measures.firstAttemptVerificationRate,
    ),
    needsAttentionRate: mean((measures) => measures.needsAttentionRate),
    mutationKillRate: mean((measures) => measures.mutationKillRate),
    independentSolveRate: mean((measures) => measures.independentSolveRate),
    reviewerEdits: all.reduce((sum, measures) => sum + measures.reviewerEdits, 0),
    outputTokensPerStep: mean((measures) => measures.outputTokensPerStep),
    inputTokensPerStep: mean((measures) => measures.inputTokensPerStep),
  };
}
