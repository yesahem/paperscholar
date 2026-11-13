import type { ContentStore } from "@repo/content";
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
import { configRoutes } from "./routes/config";
import { cspReportRoutes } from "./routes/csp-reports";
import { healthRoutes } from "./routes/health";
import { papersRoutes } from "./routes/papers";
import { tracksRoutes } from "./routes/tracks";
import { createContentCatalog } from "./services/content-catalog";
import { instanceConfig } from "./services/instance-config";
import type { AppEnv } from "./types";

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  /** Paper content, read-only (`createContentReader`). */
  content: ContentStore;
}

/**
 * Builds the HTTP application. Uses only Web-standard APIs so the same app runs
 * under Bun.serve and on serverless hosts (docs/specs/01-architecture.md §7).
 */
export function createApp({ config, logger, content }: AppDependencies) {
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

  const catalog = createContentCatalog(content);

  const v1 = new Hono<AppEnv>()
    .route("/papers", papersRoutes(catalog))
    .route("/tracks", tracksRoutes(catalog))
    .route("/config", configRoutes(instanceConfig(config)));

  const api = new Hono<AppEnv>()
    .route("/health", healthRoutes({ version: config.version }))
    .route("/csp-report", cspReportRoutes())
    .route("/v1", v1);

  app.route("/api", api);

  return app;
}

export type App = ReturnType<typeof createApp>;
