import {
  DEFAULT_EVAL_SET,
  measureIngestion,
  PROMPT_VERSION,
  readJson,
  summariseMeasures,
  writeJson,
  type EvalSet,
  type IngestionMeasures,
  type PipelineDeps,
} from "@repo/pipeline";
import {
  parseArxivReference,
  type EvalMeasures,
  type EvalRun,
  type IngestionStatus,
  type LatestEval,
} from "@repo/shared";
import { z } from "zod";
import { AppError } from "../lib/errors";
import type { Ingestions } from "./ingestions";

const LATEST_KEY = "evals/latest.json";
const runKey = (id: string) => `evals/${id}.json`;

/** What is stored of a run: which ingestion each reference paper became. Measures are never stored. */
const storedRunSchema = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  startedBy: z.string().nullable(),
  fresh: z.boolean(),
  model: z.string(),
  promptVersion: z.string(),
  papers: z.array(
    z.object({
      name: z.string(),
      source: z.string(),
      ingestionId: z.uuid().nullable(),
      error: z.string().nullable(),
    }),
  ),
});
type StoredRun = z.infer<typeof storedRunSchema>;
const latestPointerSchema = z.object({ id: z.uuid() });

/** States in which an ingestion still has automatic work to do. */
const RUNNING = new Set<IngestionStatus>(["queued", "reading", "planning", "writing"]);

function pickMeasures(measures: IngestionMeasures): EvalMeasures {
  return {
    steps: measures.steps,
    firstAttemptVerificationRate: measures.firstAttemptVerificationRate,
    needsAttentionRate: measures.needsAttentionRate,
    mutationKillRate: measures.mutationKillRate,
    independentSolveRate: measures.independentSolveRate,
    reviewerEdits: measures.reviewerEdits,
    outputTokensPerStep: measures.outputTokensPerStep,
    inputTokensPerStep: measures.inputTokensPerStep,
    calls: measures.calls,
    sandboxRuns: measures.sandboxRuns,
  };
}

/**
 * The quality eval of docs/specs/09-paper-pipeline.md §18, run from the CMS
 * (docs/specs/14-cms.md §8.3). A run is only a record of which ingestion each
 * reference paper became; its figures are measured live from those ingestions.
 */
export function createEvals({
  deps,
  ingestions,
  set = DEFAULT_EVAL_SET,
  now = () => new Date(),
}: {
  deps: PipelineDeps;
  ingestions: Ingestions;
  set?: EvalSet;
  now?: () => Date;
}) {
  const { storage } = deps;

  async function view(run: StoredRun): Promise<EvalRun> {
    const papers = await Promise.all(
      run.papers.map(async (paper) => {
        if (paper.ingestionId === null) {
          return { ...paper, status: null, running: false, measures: null };
        }
        const measured = await measureIngestion(deps, paper.ingestionId);
        const status = measured.status as IngestionStatus;
        return {
          ...paper,
          status,
          running: RUNNING.has(status),
          measures: pickMeasures(measured),
          raw: measured,
        };
      }),
    );
    const measured = papers.flatMap((paper) => ("raw" in paper ? [paper.raw] : []));
    return {
      id: run.id,
      startedAt: run.startedAt,
      startedBy: run.startedBy,
      fresh: run.fresh,
      model: run.model,
      promptVersion: run.promptVersion,
      finished: papers.every((paper) => !paper.running),
      papers: papers.map(
        ({ name, source, ingestionId, error, status, running, measures }) => ({
          name,
          source,
          ingestionId,
          status,
          running,
          error,
          measures,
        }),
      ),
      summary: measured.length === 0 ? null : summariseMeasures(measured),
    };
  }

  async function latestStored(): Promise<StoredRun | null> {
    const pointer = await readJson(storage, LATEST_KEY, latestPointerSchema);
    return pointer ? readJson(storage, runKey(pointer.id), storedRunSchema) : null;
  }

  return {
    async latest(): Promise<LatestEval> {
      const stored = await latestStored();
      return { run: stored ? await view(stored) : null };
    },

    /** Starts every reference paper, or reuses its ingestion, and records the run. */
    async start(
      userId: string,
      { fresh }: { fresh: boolean },
      origin: string,
    ): Promise<EvalRun> {
      const previous = await latestStored();
      if (previous && !(await view(previous)).finished) {
        throw new AppError("conflict", {
          message: "An eval is already running. Wait for it to finish.",
        });
      }

      const papers: StoredRun["papers"] = [];
      for (const paper of set.papers) {
        const arxivId = paper.source.startsWith("arxiv:")
          ? parseArxivReference(paper.source)
          : null;
        if (arxivId === null) {
          papers.push({
            name: paper.name,
            source: paper.source,
            ingestionId: null,
            error: "Only arXiv sources can be evaluated from the CMS.",
          });
          continue;
        }
        try {
          const body = {
            arxivId,
            options: {
              targetSteps: null,
              environment: null,
              focus: null,
              pauseAfterPlan: false,
            },
            rightsConfirmed: true as const,
            force: false,
          };
          let ingestion = await ingestions.create(userId, body, origin);
          if (!ingestion.created && fresh && ingestion.status !== "published") {
            await ingestions.cancel(ingestion.id);
            ingestion = await ingestions.create(userId, body, origin);
          }
          papers.push({
            name: paper.name,
            source: paper.source,
            ingestionId: ingestion.id,
            error: null,
          });
        } catch (error) {
          papers.push({
            name: paper.name,
            source: paper.source,
            ingestionId: null,
            error:
              error instanceof AppError
                ? error.message
                : "The paper could not be started.",
          });
          if (!(error instanceof AppError))
            deps.logger.error("eval paper failed", { error });
        }
      }

      const run: StoredRun = {
        id: crypto.randomUUID(),
        startedAt: now().toISOString(),
        startedBy: userId,
        fresh,
        model: deps.llm.model,
        promptVersion: PROMPT_VERSION,
        papers,
      };
      await writeJson(storage, runKey(run.id), run);
      await writeJson(storage, LATEST_KEY, { id: run.id });
      return view(run);
    },
  };
}

export type AdminEvals = ReturnType<typeof createEvals>;
