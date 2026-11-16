import { CONTENT_INDEX_LOCK, ContentStore } from "@repo/content";
import { createAdvisoryLock, type Database } from "@repo/db";
import { DEFAULT_PIPELINE_SETTINGS, type PipelineDeps } from "@repo/pipeline";
import type { SandboxProvider } from "@repo/runner";
import type { Logger } from "@repo/shared/logger";
import { createStorage } from "@repo/storage";
import type { AppConfig } from "../env";
import { createPipelineRunner, type PipelineRunner } from "../services/pipeline-runner";
import { createLlmClient } from "./llm";

/**
 * The pipeline's dependencies for this instance, or null when it has no model
 * or the feature is switched off (docs/specs/13-self-hosting.md §4).
 * Content writes are serialised with the database's advisory lock.
 */
export function createPipelineDeps(
  config: Pick<AppConfig, "pipeline" | "storage">,
  { db, sandbox, logger }: { db: Database; sandbox: SandboxProvider; logger: Logger },
): PipelineDeps | null {
  const { llm, enabled, limits } = config.pipeline;
  if (!enabled || llm === null) return null;
  const storage = createStorage(config.storage);
  return {
    db,
    storage,
    content: new ContentStore({
      storage,
      lock: createAdvisoryLock(db, CONTENT_INDEX_LOCK),
    }),
    llm: createLlmClient(llm, logger),
    sandbox,
    logger: logger.child({ component: "pipeline" }),
    settings: { ...DEFAULT_PIPELINE_SETTINGS, ...limits },
  };
}

/** The pipeline as the API uses it: its dependencies and what drives its ticks. */
export interface Pipeline {
  deps: PipelineDeps;
  runner: PipelineRunner;
}

/** Tick budget on serverless: under the function's 300 s limit in vercel.json. */
export const SERVERLESS_TICK_BUDGET_MS = 240_000;
/** Tick budget in a long-running process; it simply ticks again. */
export const PROCESS_TICK_BUDGET_MS = 5 * 60_000;

/**
 * Builds the pipeline for an entry file. On serverless hosts each invocation
 * hands over to the next through the internal tick endpoint, which needs
 * INTERNAL_SECRET; without it the per-minute schedule carries the work.
 */
export function createPipeline(
  config: Pick<AppConfig, "pipeline" | "storage" | "internalSecret">,
  services: {
    db: Database;
    sandbox: SandboxProvider;
    logger: Logger;
    runInBackground: (task: Promise<unknown>) => void;
    mode: "serverless" | "process";
  },
): Pipeline | null {
  const deps = createPipelineDeps(config, services);
  if (deps === null) return null;
  const secret = config.internalSecret;
  const runner = createPipelineRunner({
    deps,
    logger: services.logger,
    runInBackground: services.runInBackground,
    mode: services.mode,
    budgetMs:
      services.mode === "serverless" ? SERVERLESS_TICK_BUDGET_MS : PROCESS_TICK_BUDGET_MS,
    ...(secret
      ? {
          continueAt: async (origin: string) => {
            const response = await fetch(new URL("/api/internal/cron/pipeline", origin), {
              method: "POST",
              headers: { Authorization: `Bearer ${secret}` },
            });
            if (response.status !== 202) {
              services.logger.warn("could not hand the pipeline to a new invocation", {
                status: response.status,
              });
            }
          },
        }
      : {}),
  });
  return { deps, runner };
}
