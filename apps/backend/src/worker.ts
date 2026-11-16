/**
 * Background worker for self-hosted instances (docs/specs/13-self-hosting.md §3):
 * runs the daily cleanup on start and every 24 hours, and, when the instance
 * has a model, polls the paper pipeline's task queue every 2 seconds
 * (docs/specs/09-paper-pipeline.md §13). Serverless deployments call the
 * internal cron endpoints from a schedule instead.
 */
import { closeDb, createDb } from "@repo/db";
import { PIPELINE_HANDLERS, tick } from "@repo/pipeline";
import { createLogger } from "@repo/shared/logger";
import { createContentReader } from "./adapters/content";
import { createPipelineDeps, PROCESS_TICK_BUDGET_MS } from "./adapters/pipeline";
import { createSandboxProvider } from "./adapters/sandbox";
import { loadConfigOrExit } from "./load-config";
import { runCleanup } from "./services/cleanup";
import { TICK_CONCURRENCY } from "./services/pipeline-runner";
import { createRateLimiter } from "./services/rate-limiter";
import { createSubmissions } from "./services/submissions";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PIPELINE_POLL_MS = 2_000;
/** How long shutdown waits for running pipeline tasks before leaving them to their leases. */
const SHUTDOWN_GRACE_MS = 30_000;

const config = loadConfigOrExit();
const logger = createLogger({ level: config.logLevel, base: { service: "worker" } });
const db = createDb({ url: config.databaseUrl, maxConnections: 4 });
const sandbox = createSandboxProvider(config, logger);
const submissions = createSubmissions({
  db,
  content: createContentReader(config),
  provider: sandbox,
  limiter: createRateLimiter(db),
  limits: config.limits,
  logger,
  // The worker never creates submissions; nothing is dispatched from here.
  dispatch: () => {},
});
const pipeline = createPipelineDeps(config, { db, sandbox, logger });

async function cleanup(): Promise<void> {
  try {
    await runCleanup({ db, submissions, logger });
  } catch (error) {
    logger.error("cleanup failed; retrying at the next interval", { error });
  }
}

const stopping = new AbortController();

/** Ticks while there is work, sleeping between empty polls. */
async function pollPipeline(): Promise<void> {
  if (pipeline === null) return;
  while (!stopping.signal.aborted) {
    try {
      const result = await tick(pipeline, {
        handlers: PIPELINE_HANDLERS,
        budgetMs: PROCESS_TICK_BUDGET_MS,
        concurrency: TICK_CONCURRENCY,
        signal: stopping.signal,
      });
      if (result.ran > 0) continue;
    } catch (error) {
      logger.error("pipeline tick failed; polling again", { error });
    }
    await Bun.sleep(PIPELINE_POLL_MS);
  }
}

logger.info("worker started", {
  cleanupEveryHours: CLEANUP_INTERVAL_MS / 3_600_000,
  pipeline: pipeline === null ? "off" : pipeline.llm.model,
});
await cleanup();
const timer = setInterval(() => void cleanup(), CLEANUP_INTERVAL_MS);
const polling = pollPipeline();

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info("worker shutting down", { signal });
  clearInterval(timer);
  stopping.abort();
  // Tasks still running when the grace period ends are rerun once their lease lapses.
  await Promise.race([polling, Bun.sleep(SHUTDOWN_GRACE_MS)]);
  await closeDb(db);
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
