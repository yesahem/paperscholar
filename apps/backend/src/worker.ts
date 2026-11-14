/**
 * Background worker for self-hosted instances (docs/specs/13-self-hosting.md §3):
 * runs the daily cleanup on start and every 24 hours. Serverless deployments
 * call POST /api/internal/cron/cleanup from a schedule instead. Pipeline tasks
 * join this process in M6.
 */
import { closeDb, createDb } from "@repo/db";
import { createLogger } from "@repo/shared/logger";
import { createContentReader } from "./adapters/content";
import { createSandboxProvider } from "./adapters/sandbox";
import { loadConfigOrExit } from "./load-config";
import { runCleanup } from "./services/cleanup";
import { createRateLimiter } from "./services/rate-limiter";
import { createSubmissions } from "./services/submissions";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const config = loadConfigOrExit();
const logger = createLogger({ level: config.logLevel, base: { service: "worker" } });
const db = createDb({ url: config.databaseUrl, maxConnections: 2 });
const submissions = createSubmissions({
  db,
  content: createContentReader(config),
  provider: createSandboxProvider(config, logger),
  limiter: createRateLimiter(db),
  limits: config.limits,
  logger,
  // The worker never creates submissions; nothing is dispatched from here.
  dispatch: () => {},
});

async function cleanup(): Promise<void> {
  try {
    await runCleanup({ db, submissions, logger });
  } catch (error) {
    logger.error("cleanup failed; retrying at the next interval", { error });
  }
}

logger.info("worker started", { cleanupEveryHours: CLEANUP_INTERVAL_MS / 3_600_000 });
await cleanup();
const timer = setInterval(() => void cleanup(), CLEANUP_INTERVAL_MS);

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info("worker shutting down", { signal });
  clearInterval(timer);
  await closeDb(db);
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
