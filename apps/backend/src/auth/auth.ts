import { eq, schema, type Database } from "@repo/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SITE } from "@repo/shared";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import type { EmailSender } from "../adapters/email/types";
import { verifiesEmail, type AppConfig } from "../env";
import type { Logger } from "@repo/shared/logger";
import { passwordResetEmail, verificationEmail } from "../services/email-templates";
import type { RateLimiter } from "../services/rate-limiter";
import { generateUsername } from "../services/usernames";
import { USER_ADDITIONAL_FIELDS, usernamePlugin } from "./schema-options";

/** Where Better Auth's routes live, behind the web app's /api proxy. */
export const AUTH_BASE_PATH = "/api/auth";

const DAY_SECONDS = 24 * 60 * 60;

/** Session lifetime and refresh (docs/specs/06-auth.md §2). */
export const SESSION_EXPIRES_IN_SECONDS = 30 * DAY_SECONDS;
export const SESSION_UPDATE_AGE_SECONDS = DAY_SECONDS;
export const SESSION_COOKIE_CACHE_SECONDS = 5 * 60;

/** How long links in emails stay valid. */
export const VERIFICATION_LINK_SECONDS = DAY_SECONDS;
export const RESET_LINK_SECONDS = 60 * 60;

/** Routes Better Auth would expose that this product replaces or does not offer. */
export const DISABLED_AUTH_PATHS = [
  // Profile changes go through PATCH /v1/me, which applies the username rules.
  "/update-user",
  // Account deletion goes through DELETE /v1/me, which also removes stored files.
  "/delete-user",
  "/delete-user/callback",
  "/change-email",
  // Sign-in is by email (docs/specs/06-auth.md §1).
  "/sign-in/username",
  "/is-username-available",
];

/** Auth paths limited per IP to `config.auth.rateLimit` (docs/specs/11-security-ops.md §3). */
export const RATE_LIMITED_AUTH_PATHS = [
  "/sign-in/*",
  "/sign-up/*",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
];

export interface AuthDependencies {
  config: AppConfig;
  db: Database;
  /** Null when this instance sends no email. */
  email: EmailSender | null;
  limiter: RateLimiter;
  logger: Logger;
  /** Keeps work going after the response, such as sending an email. */
  runInBackground: (task: Promise<unknown>) => void;
}

/**
 * Better Auth for this instance (docs/specs/06-auth.md). Email and password
 * always; Google when configured; verification and reset emails when an
 * email driver exists.
 */
export function createAuth({
  config,
  db,
  email,
  limiter,
  logger,
  runInBackground,
}: AuthDependencies) {
  const authLogger = logger.child({ component: "auth" });
  const verifying = verifiesEmail(config) && email !== null;
  const adminEmails = new Set(config.auth.adminEmails);
  const isAdminEmail = (address: string) => adminEmails.has(address.toLowerCase());
  const authRule = {
    window: config.auth.rateLimit.windowSeconds,
    max: config.auth.rateLimit.max,
  };

  const usernameTaken = async (username: string) =>
    (
      await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.username, username))
        .limit(1)
    ).length > 0;

  const send = (deliver: () => Promise<void>, kind: string) =>
    deliver().catch((error: unknown) => {
      authLogger.error("email not sent", { kind, error });
    });

  const options = {
    appName: SITE.name,
    baseURL: config.webOrigin,
    basePath: AUTH_BASE_PATH,
    secret: config.auth.secret,
    trustedOrigins: [config.webOrigin],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
      transaction: true,
    }),
    user: { additionalFields: USER_ADDITIONAL_FIELDS },
    plugins: [usernamePlugin()],
    disabledPaths: DISABLED_AUTH_PATHS,

    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.auth.signups,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Unverified users are signed in but restricted (docs/specs/06-auth.md §4).
      requireEmailVerification: false,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
      ...(email
        ? {
            sendResetPassword: async ({ user, url }) =>
              send(() => email.send(passwordResetEmail(user.email, url)), "reset"),
          }
        : {}),
    },

    ...(verifying
      ? {
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            expiresIn: VERIFICATION_LINK_SECONDS,
            sendVerificationEmail: async ({ user, url }) =>
              send(() => email.send(verificationEmail(user.email, url)), "verification"),
            afterEmailVerification: async (user) => {
              if (!isAdminEmail(user.email)) return;
              const context = await auth.$context;
              await context.internalAdapter.updateUser(user.id, { role: "admin" });
              authLogger.info("role granted", {
                userId: user.id,
                role: "admin",
                by: "ADMIN_EMAILS",
              });
            },
          },
        }
      : {}),

    ...(config.auth.google
      ? {
          socialProviders: {
            google: {
              clientId: config.auth.google.clientId,
              clientSecret: config.auth.google.clientSecret,
              disableSignUp: !config.auth.signups,
              prompt: "select_account",
            },
          },
        }
      : {}),

    account: {
      // A Google sign-in joins an existing password account only when that
      // account's email is verified (docs/specs/06-auth.md §1); Better Auth
      // requires this by default.
      accountLinking: { enabled: true },
      // Google's tokens are kept with the account; encrypt them at rest.
      encryptOAuthTokens: true,
    },

    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_SECONDS },
    },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const username =
              typeof user.username === "string" && user.username !== ""
                ? user.username
                : await generateUsername(user.email, usernameTaken);
            const admin = isAdminEmail(user.email) && (user.emailVerified || !verifying);
            return { data: { ...user, username, role: admin ? "admin" : "user" } };
          },
          after: async (user) => {
            await db
              .insert(schema.profiles)
              .values({ userId: user.id })
              .onConflictDoNothing();
            if (user.role === "admin") {
              authLogger.info("role granted", {
                userId: user.id,
                role: "admin",
                by: "ADMIN_EMAILS",
              });
            }
          },
        },
      },
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: Object.fromEntries(
        RATE_LIMITED_AUTH_PATHS.map((path) => [path, authRule]),
      ),
      customStorage: {
        consume: async (key, rule) => {
          const decision = await limiter.consume(`auth:${key}`, {
            windowSeconds: rule.window,
            max: rule.max,
          });
          return { allowed: decision.allowed, retryAfter: decision.retryAfterSeconds };
        },
      },
    },

    advanced: {
      cookiePrefix: "paperscholar",
      useSecureCookies: config.webOrigin.startsWith("https:"),
      ipAddress: {
        ipAddressHeaders: [config.auth.clientIpHeader],
        trustedProxies: config.auth.trustedProxies,
      },
      database: { generateId: () => Bun.randomUUIDv7() },
      backgroundTasks: { handler: runInBackground },
    },

    logger: {
      level: config.logLevel,
      // Better Auth's extra arguments can hold emails or tokens; only errors are kept.
      log: (level, message, ...args) => {
        const error = args.find((arg): arg is Error => arg instanceof Error);
        authLogger[level](message, error ? { error } : {});
      },
    },
    onAPIError: {
      // Refusals (bad password, taken username) are normal; failures are not.
      onError: (error) => {
        if (error instanceof APIError && error.status !== "INTERNAL_SERVER_ERROR") {
          authLogger.debug("auth request refused", { status: error.status });
        } else {
          authLogger.error("auth request failed", { error });
        }
      },
    },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;

  const auth = betterAuth(options);
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
export type AuthUser = AuthSession["user"];
