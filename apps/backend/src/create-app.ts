import { CONTENT_INDEX_LOCK, ContentStore } from "@repo/content";
import { createAdvisoryLock, type Database } from "@repo/db";
import { createStorage } from "@repo/storage";
import type { SandboxProvider } from "@repo/runner";
import { AVATAR_MAX_BYTES } from "@repo/shared";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { AvatarStore } from "./adapters/avatar-store";
import type { Pipeline } from "./adapters/pipeline";
import type { EmailSender } from "./adapters/email/types";
import { createAuth } from "./auth/auth";
import { verifiesEmail, type AppConfig } from "./env";
import type { Logger } from "@repo/shared/logger";
import { limitBody } from "./middleware/body-limit";
import { defaultCacheControl } from "./middleware/cache-control";
import { createErrorHandler, notFoundHandler } from "./middleware/error-handler";
import { requireRole } from "./middleware/guards";
import { mutationLimit } from "./middleware/mutation-limit";
import { originCheck } from "./middleware/origin-check";
import { requestContext } from "./middleware/request-context";
import { requestLogger } from "./middleware/request-logger";
import { session } from "./middleware/session";
import { adminDashboardRoutes } from "./routes/admin/dashboard";
import { adminEvalRoutes } from "./routes/admin/evals";
import { adminIngestionRoutes } from "./routes/admin/ingestions";
import { adminPaperRoutes } from "./routes/admin/papers";
import { adminTrackRoutes } from "./routes/admin/tracks";
import { adminUserRoutes } from "./routes/admin/users";
import { authRoutes } from "./routes/auth";
import { avatarRoutes } from "./routes/avatars";
import { configRoutes } from "./routes/config";
import { cspReportRoutes } from "./routes/csp-reports";
import { healthRoutes } from "./routes/health";
import { internalRoutes } from "./routes/internal";
import { leaderboardRoutes } from "./routes/leaderboard";
import { AVATAR_UPLOAD_PATH, meRoutes } from "./routes/me";
import { papersRoutes } from "./routes/papers";
import { progressRoutes } from "./routes/progress";
import { submissionsRoutes } from "./routes/submissions";
import { tracksRoutes } from "./routes/tracks";
import { usersRoutes } from "./routes/users";
import { createAccounts } from "./services/accounts";
import { createAvatars } from "./services/avatars";
import { runCleanup } from "./services/cleanup";
import { createAdminPapers } from "./services/admin-papers";
import { createAdminTracks } from "./services/admin-tracks";
import { createDashboard } from "./services/dashboard";
import { createEvals } from "./services/evals";
import { createContentCatalog } from "./services/content-catalog";
import { createIngestions, PDF_UPLOAD_PATH_PREFIX } from "./services/ingestions";
import { PROMPT_VERSION } from "@repo/pipeline";
import { instanceConfig } from "./services/instance-config";
import { createLeaderboard } from "./services/leaderboard";
import { createProfiles } from "./services/profiles";
import { createRateLimiter } from "./services/rate-limiter";
import { createSubmissions, type Submissions } from "./services/submissions";
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
  /** Where learners' code runs (`createSandboxProvider`). */
  sandbox: SandboxProvider;
  /** Where avatars are kept (`createAvatarStore`). */
  avatarStore: AvatarStore;
  /** The paper pipeline (`createPipeline`); null when the instance has no model. */
  pipeline: Pipeline | null;
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
  sandbox,
  avatarStore,
  pipeline,
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
    // The avatar upload carries a 2 MB image and its multipart framing; a PDF
    // upload through the API (fs storage) carries the paper.
    limitBody(undefined, {
      [AVATAR_UPLOAD_PATH]: AVATAR_MAX_BYTES + 64 * 1024,
      [`${PDF_UPLOAD_PATH_PREFIX}*`]: config.pipeline.limits.maxPdfBytes,
    }),
  );

  app.onError(createErrorHandler(logger));
  app.notFound(notFoundHandler);

  const catalog = createContentCatalog(content);
  const limiter = createRateLimiter(db);
  const auth = createAuth({ config, db, email, limiter, logger, runInBackground });
  const accounts = createAccounts({ db, auth, avatars: avatarStore, logger });
  const avatarUrl = (key: string) => avatarStore.url(key);
  const avatars = createAvatars({ db, store: avatarStore, limiter, logger });
  const profiles = createProfiles({ db, content, avatarUrl });
  const leaderboard = createLeaderboard({ db, avatarUrl });
  // Inline dispatch (docs/specs/07-runner.md §3): the run continues after the
  // 202, kept alive by the host's waitUntil on serverless.
  const submissions: Submissions = createSubmissions({
    db,
    content,
    provider: sandbox,
    limiter,
    limits: config.limits,
    logger,
    dispatch: (id) => runInBackground(submissions.execute(id)),
  });

  if (pipeline && config.cmsOrigin === null) {
    logger.warn(
      "The paper pipeline is on but CMS_ORIGIN is not set; set it to the CMS's origin so maintainers can sign in there (docs/specs/14-cms.md §3.4).",
    );
  }

  const ingestions = pipeline
    ? createIngestions({
        deps: pipeline.deps,
        kick: (origin) => pipeline.runner.kick(origin),
      })
    : null;

  // Status changes write content/index.json under the database's advisory lock.
  const contentWriter =
    pipeline?.deps.content ??
    new ContentStore({
      storage: createStorage(config.storage),
      lock: createAdvisoryLock(db, CONTENT_INDEX_LOCK),
    });
  const adminPapers = createAdminPapers({ db, content: contentWriter });
  const adminTracks = createAdminTracks({ content: contentWriter });
  const evals =
    pipeline && ingestions ? createEvals({ deps: pipeline.deps, ingestions }) : null;
  const dashboard = createDashboard({
    db,
    pipeline: {
      enabled: pipeline !== null,
      model: pipeline?.deps.llm.model ?? null,
      promptVersion: PROMPT_VERSION,
      limits: {
        ingestionsPerDay: config.pipeline.limits.ingestionsPerDay,
        concurrentIngestions: config.pipeline.limits.concurrentIngestions,
        outputTokenBudget: config.pipeline.limits.outputTokenBudget,
      },
    },
  });

  const v1 = new Hono<AppEnv>()
    .use(
      originCheck(config.webOrigin, config.cmsOrigin),
      session(auth),
      mutationLimit(limiter, config.limits.mutationsPerMinute),
    )
    // Maintainer and admin routes (M6) are invisible to everyone else.
    .use("/admin/*", requireRole("maintainer", accounts.currentRole))
    .route("/admin/ingestions", adminIngestionRoutes(ingestions))
    .route("/admin/papers", adminPaperRoutes(adminPapers))
    .route("/admin/dashboard", adminDashboardRoutes(dashboard))
    .route("/admin/tracks", adminTrackRoutes(adminTracks))
    .route("/admin/evals", adminEvalRoutes(evals, accounts))
    .route("/admin/users", adminUserRoutes(accounts))
    .route("/papers", papersRoutes(catalog))
    .route("/tracks", tracksRoutes(catalog))
    .route("/config", configRoutes(instanceConfig(config)))
    .route("/me", meRoutes(accounts, avatars, auth))
    .route("/submissions", submissionsRoutes(submissions, verifiesEmail(config)))
    .route("/progress", progressRoutes(db))
    .route("/leaderboard", leaderboardRoutes(leaderboard))
    .route(
      "/users",
      usersRoutes({
        profiles,
        limiter,
        clientIp: {
          header: config.auth.clientIpHeader,
          trustedProxies: config.auth.trustedProxies,
        },
        instanceVerifiesEmail: verifiesEmail(config),
      }),
    );

  const api = new Hono<AppEnv>()
    .route("/health", healthRoutes({ version: config.version }))
    .route("/csp-report", cspReportRoutes())
    .route("/avatars", avatarRoutes(avatarStore))
    .route("/auth", authRoutes(auth, config.webOrigin, config.cmsOrigin))
    .route(
      "/internal",
      internalRoutes(config.internalSecret, {
        cleanup: () => runCleanup({ db, submissions, logger }),
        pipeline: pipeline?.runner ?? null,
      }),
    )
    .route("/v1", v1);

  app.route("/api", api);

  return app;
}

export type App = ReturnType<typeof createApp>;
