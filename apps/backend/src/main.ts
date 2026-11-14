/**
 * Long-running entry: local development (`bun dev`) and self-hosting.
 * Serverless hosts use src/index.ts instead.
 */
import { closeDb, createDb } from "@repo/db";
import { createAvatarStore } from "./adapters/avatar-store";
import { createContentReader } from "./adapters/content";
import { createEmailSender } from "./adapters/email/create-email-sender";
import { createPipeline } from "./adapters/pipeline";
import { createSandboxProvider } from "./adapters/sandbox";
import { createApp } from "./create-app";
import { createLogger } from "@repo/shared/logger";
import { loadConfigOrExit } from "./load-config";

const config = loadConfigOrExit();
const logger = createLogger({ level: config.logLevel });
const db = createDb({ url: config.databaseUrl });
const sandbox = createSandboxProvider(config, logger);
// The process outlives each request, so background work just needs its errors logged.
const runInBackground = (task: Promise<unknown>) => {
  task.catch((error: unknown) => logger.error("background task failed", { error }));
};
const app = createApp({
  config,
  logger,
  content: createContentReader(config),
  db,
  email: createEmailSender(config.email),
  sandbox,
  avatarStore: createAvatarStore(config),
  // Pipeline tasks started from here keep running in this process; the worker
  // (bun run worker) polls for them as well.
  pipeline: createPipeline(config, {
    db,
    sandbox,
    logger,
    runInBackground,
    mode: "process",
  }),
  runInBackground,
});

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
});

logger.info("backend listening", {
  url: server.url.href,
  env: config.env,
  version: config.version,
  email: config.email.driver,
});

// `bun --hot` re-runs this module on change; register shutdown handlers once.
if (process.listenerCount("SIGTERM") === 0) {
  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info("backend shutting down", { signal });
    await server.stop();
    await closeDb(db);
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
