import type { ContentStore } from "@repo/content";
import type { Database } from "@repo/db";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { EmailSender } from "./adapters/email/types";
import { createAuth } from "./auth/auth";
import type { AppConfig } from "./env";
import type { Logger } from "./lib/logger";
import { limitBody } from "./middleware/body-limit";
import { defaultCacheControl } from "./middleware/cache-control";
import { createErrorHandler, notFoundHandler } from "./middleware/error-handler";
import { requireRole } from "./middleware/guards";
import { originCheck } from "./middleware/origin-check";
import { requestContext } from "./middleware/request-context";
import { requestLogger } from "./middleware/request-logger";
import { session } from "./middleware/session";
import { authRoutes } from "./routes/auth";
import { configRoutes } from "./routes/config";
import { cspReportRoutes } from "./routes/csp-reports";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { papersRoutes } from "./routes/papers";
import { tracksRoutes } from "./routes/tracks";
import { createAccounts } from "./services/accounts";
import { createContentCatalog } from "./services/content-catalog";
import { instanceConfig } from "./services/instance-config";
import { createRateLimiter } from "./services/rate-limiter";
import type { AppEnv } from "./types";

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  /** Paper content, read-only (`createContentReader`). */
  content: ContentStore;
  /** Pooled Postgres client. Connections open on first use. */
  db: Database;
  /** Null when this instance sends no email. */
  email: EmailSender | null;
  /**
   * Keeps work going after the response is sent. Serverless hosts must keep
   * the function alive for it (`waitUntil`); a long-running server need not.
   */
  runInBackground: (task: Promise<unknown>) => void;
}

/**
 * Builds the HTTP application. Uses only Web-standard APIs so the same app runs
 * under Bun.serve and on serverless hosts (docs/specs/01-architecture.md §7).
 */
export function createApp({
  config,
  logger,
  content,
  db,
  email,
  runInBackground,
}: AppDependencies) {
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
  const limiter = createRateLimiter(db);
  const auth = createAuth({ config, db, email, limiter, logger, runInBackground });
  const accounts = createAccounts({ db, auth });

  const v1 = new Hono<AppEnv>()
    .use(originCheck(config.webOrigin), session(auth))
    // Maintainer and admin routes (M6) are invisible to everyone else.
    .use("/admin/*", requireRole("maintainer", accounts.currentRole))
    .route("/papers", papersRoutes(catalog))
    .route("/tracks", tracksRoutes(catalog))
    .route("/config", configRoutes(instanceConfig(config)))
    .route("/me", meRoutes(accounts, auth));

  const api = new Hono<AppEnv>()
    .route("/health", healthRoutes({ version: config.version }))
    .route("/csp-report", cspReportRoutes())
    .route("/auth", authRoutes(auth, config.webOrigin))
    .route("/v1", v1);

  app.route("/api", api);

  return app;
}

export type App = ReturnType<typeof createApp>;
