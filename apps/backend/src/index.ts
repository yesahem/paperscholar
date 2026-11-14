/**
 * Serverless entry. The host imports this module and calls the default export's
 * `fetch` for each request. Invalid configuration fails the deployment at start-up.
 */
import { createDb } from "@repo/db";
import { waitUntil } from "@vercel/functions";
import { createContentReader } from "./adapters/content";
import { createEmailSender } from "./adapters/email/create-email-sender";
import { createSandboxProvider } from "./adapters/sandbox";
import { createApp } from "./create-app";
import { loadConfig } from "./env";
import { createLogger } from "@repo/shared/logger";

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });

export default createApp({
  config,
  logger,
  content: createContentReader(config),
  db: createDb({ url: config.databaseUrl }),
  email: createEmailSender(config.email),
  sandbox: createSandboxProvider(config, logger),
  // Keeps the function alive until background work, such as an email, finishes.
  runInBackground: (task) => {
    waitUntil(
      task.catch((error: unknown) => logger.error("background task failed", { error })),
    );
  },
});
