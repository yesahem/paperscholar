import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { AppConfig } from "./env";
import type { Logger } from "./lib/logger";
import { limitBody } from "./middleware/body-limit";
import { defaultCacheControl } from "./middleware/cache-control";
import { createErrorHandler, notFoundHandler } from "./middleware/error-handler";
import { requestContext } from "./middleware/request-context";
import { requestLogger } from "./middleware/request-logger";
import { healthRoutes } from "./routes/health";
import type { AppEnv } from "./types";

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
}

/**
 * Builds the HTTP application. Uses only Web-standard APIs so the same app runs
 * under Bun.serve and on serverless hosts (docs/specs/01-architecture.md §7).
 */
export function createApp({ config, logger }: AppDependencies) {
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    requestId(),
    requestContext(logger),
    requestLogger(),
    secureHeaders(),
    defaultCacheControl(),
    limitBody(),
  );

  app.onError(createErrorHandler(logger));
  app.notFound(notFoundHandler);

  const api = new Hono<AppEnv>().route(
    "/health",
    healthRoutes({ version: config.version }),
  );

  app.route("/api", api);

  return app;
}

export type App = ReturnType<typeof createApp>;
