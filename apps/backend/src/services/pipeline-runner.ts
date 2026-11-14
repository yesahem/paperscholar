import {
  PIPELINE_HANDLERS,
  tick,
  type PipelineDeps,
  type TaskHandlers,
  type TickResult,
} from "@repo/pipeline";
import type { Logger } from "@repo/shared/logger";

/** Tasks one process runs at once. Each ingestion is held to three by the engine. */
export const TICK_CONCURRENCY = 4;

export interface PipelineRunner {
  /**
   * Starts running pipeline tasks in the background, if this process is not
   * already. `origin` is this API's own origin, for continuing elsewhere.
   */
  kick(origin: string): void;
  /** One tick, awaited: for the scheduled safety net and the commands. */
  runOnce(): Promise<TickResult>;
}

export interface PipelineRunnerOptions {
  deps: PipelineDeps;
  logger: Logger;
  runInBackground: (task: Promise<unknown>) => void;
  /** Wall-clock budget of one tick (docs/specs/09-paper-pipeline.md §13). */
  budgetMs: number;
  /**
   * `serverless`: one tick per invocation, then hand over to a fresh invocation
   * through `continueAt` while work remains. `process`: keep ticking here.
   */
  mode: "serverless" | "process";
  /** Asks a new invocation to carry on; serverless only. */
  continueAt?: (origin: string) => Promise<void>;
  /** In `process` mode, how soon to look again when only delayed retries remain. */
  idleRecheckMs?: number;
  /** The task handlers; tests substitute their own. */
  handlers?: TaskHandlers;
}

/**
 * Drives `tick()` from inside the API (docs/specs/09-paper-pipeline.md §13).
 * On serverless hosts each invocation ticks once and calls the next; on a
 * long-running server it ticks until the queue is empty. The worker process
 * polls on its own as well; claims are locked, so running both is harmless.
 */
export function createPipelineRunner(options: PipelineRunnerOptions): PipelineRunner {
  const { deps, logger, budgetMs, mode } = options;
  let active: Promise<void> | null = null;
  let again = false;
  let recheck: ReturnType<typeof setTimeout> | null = null;

  const handlers = options.handlers ?? PIPELINE_HANDLERS;
  const runOnce = () => tick(deps, { handlers, budgetMs, concurrency: TICK_CONCURRENCY });

  async function loop(origin: string): Promise<void> {
    for (;;) {
      again = false;
      const result = await runOnce();
      if (mode === "serverless") {
        if (result.moreWork && result.ran > 0 && options.continueAt)
          await options.continueAt(origin);
        return;
      }
      if (again || result.ran > 0) continue;
      if (result.moreWork) {
        recheck ??= setTimeout(() => {
          recheck = null;
          kick(origin);
        }, options.idleRecheckMs ?? 5_000);
      }
      return;
    }
  }

  function kick(origin: string): void {
    if (active) {
      again = true;
      return;
    }
    active = loop(origin)
      .catch((error: unknown) => logger.error("pipeline tick failed", { error }))
      .finally(() => {
        active = null;
      });
    options.runInBackground(active);
  }

  return { kick, runOnce };
}
