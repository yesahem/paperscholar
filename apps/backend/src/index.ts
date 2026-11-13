/**
 * Serverless entry. The host imports this module and calls the default export's
 * `fetch` for each request. Invalid configuration fails the deployment at start-up.
 */
import { createContentReader } from "./adapters/content";
import { createApp } from "./create-app";
import { loadConfig } from "./env";
import { createLogger } from "./lib/logger";

const config = loadConfig();

export default createApp({
  config,
  logger: createLogger({ level: config.logLevel }),
  content: createContentReader(config),
});
