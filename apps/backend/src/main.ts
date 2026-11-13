/**
 * Long-running entry: local development (`bun dev`) and self-hosting.
 * Serverless hosts use src/index.ts instead.
 */
import { createApp } from "./create-app";
import { createLogger } from "./lib/logger";
import { loadConfigOrExit } from "./load-config";

const config = loadConfigOrExit();
const logger = createLogger({ level: config.logLevel });
const app = createApp({ config, logger });

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
});

logger.info("backend listening", {
  url: server.url.href,
  env: config.env,
  version: config.version,
});

// `bun --hot` re-runs this module on change; register shutdown handlers once.
if (process.listenerCount("SIGTERM") === 0) {
  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info("backend shutting down", { signal });
    await server.stop();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
