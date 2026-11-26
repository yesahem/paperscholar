/**
 * Serverless entry. The host imports this module and calls the default export's
 * `fetch` for each request. Invalid configuration fails the deployment at start-up.
 */
import { createDb } from "@repo/db";
import { waitUntil } from "@vercel/functions";
import { createAvatarStore } from "./adapters/avatar-store";
import { createContentReader } from "./adapters/content";
import { createEmailSender } from "./adapters/email/create-email-sender";
import { createLlmClient } from "./adapters/llm";
import { createPipeline } from "./adapters/pipeline";
import { createSandboxProvider } from "./adapters/sandbox";
import { createApp } from "./create-app";
import { loadConfig } from "./env";
import { createLogger } from "@repo/shared/logger";

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });

const db = createDb({ url: config.databaseUrl });
const sandbox = createSandboxProvider(config, logger);
// Keeps the function alive until background work, such as an email, finishes.
const runInBackground = (task: Promise<unknown>) => {
  waitUntil(
    task.catch((error: unknown) => logger.error("background task failed", { error })),
  );
};

export default createApp({
  config,
  logger,
  content: createContentReader(config),
  db,
  email: createEmailSender(config.email),
  sandbox,
  avatarStore: createAvatarStore(config),
  // Each invocation ticks once and hands over to the next (docs/specs/09-paper-pipeline.md §13).
  pipeline: createPipeline(config, {
    db,
    sandbox,
    logger,
    runInBackground,
    mode: "serverless",
  }),
  llm: config.pipeline.llm ? createLlmClient(config.pipeline.llm, logger) : null,
  runInBackground,
});
