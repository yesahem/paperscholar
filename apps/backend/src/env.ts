import {
  envBooleanSchema,
  envListSchema,
  httpOriginSchema,
  parseEnv,
} from "@repo/shared";
import type { StorageConfig } from "@repo/storage";
import { resolve } from "node:path";
import { z } from "zod";
import type { LogLevel } from "@repo/shared/logger";

/** Default listen port for Bun.serve. Chosen to avoid the common 8787/8080. */
export const DEFAULT_PORT = 8797;

/** Default daily run allowance per user (docs/specs/11-security-ops.md §3). */
export const DEFAULT_RUNS_PER_DAY = 100;
/** Default runs per user per minute (docs/specs/07-runner.md §9). */
export const DEFAULT_RUNS_PER_MINUTE = 10;
/** Default ceiling on runs per day across the instance: a spending circuit-breaker. */
export const DEFAULT_GLOBAL_RUNS_PER_DAY = 20_000;
/** Default writes per user per minute (docs/specs/11-security-ops.md §3). */
export const DEFAULT_MUTATIONS_PER_MINUTE = 60;
/** Shortest accepted RUNNER_TOKEN and INTERNAL_SECRET. */
export const MIN_SHARED_SECRET_LENGTH = 32;

/** Sign-in, sign-up and reset requests allowed per IP per window (docs/specs/11-security-ops.md §3). */
export const DEFAULT_AUTH_RATE_LIMIT_MAX = 10;
export const DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS = 600;

/** Shortest accepted BETTER_AUTH_SECRET. */
export const MIN_AUTH_SECRET_LENGTH = 32;

const EMAIL_DRIVERS = ["none", "log", "resend", "smtp"] as const;
const RUNNER_PROVIDERS = ["local", "http", "vercel"] as const;

const positiveCount = (fallback: number) =>
  z.coerce
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(1, "must be at least 1")
    .default(fallback);

const sharedSecret = (command: string) =>
  z
    .string()
    .min(
      MIN_SHARED_SECRET_LENGTH,
      `must be at least ${MIN_SHARED_SECRET_LENGTH} characters (${command})`,
    )
    .optional();

const optionalText = z.string().trim().min(1).optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce
      .number({ error: "must be a number" })
      .int("must be a whole number")
      .min(1, "must be between 1 and 65535")
      .max(65535, "must be between 1 and 65535")
      .default(DEFAULT_PORT),
    WEB_ORIGIN: httpOriginSchema,
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    APP_VERSION: optionalText,
    VERCEL_GIT_COMMIT_SHA: optionalText,
    /** Set by Vercel. Serverless hosting has no persistent disk. */
    VERCEL: z.string().optional(),

    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: (issue) =>
        issue.input === undefined
          ? "is required"
          : "must be a postgres:// connection URL",
    }),

    RUNS_PER_DAY: positiveCount(DEFAULT_RUNS_PER_DAY),
    RUNS_PER_MINUTE: positiveCount(DEFAULT_RUNS_PER_MINUTE),
    GLOBAL_RUNS_PER_DAY: positiveCount(DEFAULT_GLOBAL_RUNS_PER_DAY),
    MUTATIONS_PER_MINUTE: positiveCount(DEFAULT_MUTATIONS_PER_MINUTE),

    RUNNER_PROVIDER: z.enum(RUNNER_PROVIDERS).optional(),
    RUNNER_PYTHON: optionalText,
    RUNNER_URL: z
      .url({ protocol: /^https?$/, error: "must be an http(s) URL" })
      .optional(),
    RUNNER_TOKEN: sharedSecret("openssl rand -hex 32"),
    RUNNER_IMAGE_NUMPY: optionalText,
    RUNNER_IMAGE_TORCH: optionalText,
    VERCEL_TEAM_ID: optionalText,
    VERCEL_PROJECT_ID: optionalText,
    VERCEL_TOKEN: optionalText,

    INTERNAL_SECRET: sharedSecret("openssl rand -hex 32"),

    STORAGE_DRIVER: z.enum(["fs", "r2"]).default("fs"),
    STORAGE_FS_PATH: z.string().trim().min(1).default(".storage"),
    R2_ACCOUNT_ID: optionalText,
    R2_ENDPOINT: z
      .url({ protocol: /^https?$/, error: "must be an http(s) URL" })
      .optional(),
    R2_REGION: z.string().trim().min(1).default("auto"),
    R2_ACCESS_KEY_ID: optionalText,
    R2_SECRET_ACCESS_KEY: optionalText,
    R2_BUCKET: optionalText,

    BETTER_AUTH_SECRET: z
      .string({
        error: (issue) =>
          issue.input === undefined ? "is required" : "must be a string",
      })
      .min(
        MIN_AUTH_SECRET_LENGTH,
        `must be at least ${MIN_AUTH_SECRET_LENGTH} characters (openssl rand -base64 32)`,
      ),
    ADMIN_EMAILS: envListSchema
      .pipe(z.array(z.email({ error: "must list email addresses, comma-separated" })))
      .default([]),
    ALLOW_SIGNUPS: envBooleanSchema.default(true),
    REQUIRE_EMAIL_VERIFICATION: envBooleanSchema.default(true),
    AUTH_RATE_LIMIT_MAX: z.coerce
      .number({ error: "must be a number" })
      .int("must be a whole number")
      .min(1, "must be at least 1")
      .default(DEFAULT_AUTH_RATE_LIMIT_MAX),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number({ error: "must be a number" })
      .int("must be a whole number")
      .min(1, "must be at least 1")
      .default(DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS),
    CLIENT_IP_HEADER: z.string().trim().toLowerCase().min(1).default("x-forwarded-for"),
    TRUSTED_PROXIES: envListSchema.default([]),

    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,

    EMAIL_DRIVER: z.enum(EMAIL_DRIVERS).optional(),
    EMAIL_FROM: optionalText,
    RESEND_API_KEY: optionalText,
    SMTP_HOST: optionalText,
    SMTP_PORT: z.coerce
      .number({ error: "must be a number" })
      .int("must be a whole number")
      .min(1, "must be between 1 and 65535")
      .max(65535, "must be between 1 and 65535")
      .default(587),
    SMTP_SECURE: envBooleanSchema.default(false),
    SMTP_USER: optionalText,
    SMTP_PASSWORD: optionalText,
  })
  .superRefine((env, context) => {
    const require = (key: keyof typeof env, reason: string) => {
      if (env[key] === undefined)
        context.addIssue({
          code: "custom",
          path: [key],
          message: `is required ${reason}`,
        });
    };
    if (env.STORAGE_DRIVER === "r2") {
      require("R2_ACCESS_KEY_ID", "when STORAGE_DRIVER is r2");
      require("R2_SECRET_ACCESS_KEY", "when STORAGE_DRIVER is r2");
      require("R2_BUCKET", "when STORAGE_DRIVER is r2");
      if (env.R2_ACCOUNT_ID === undefined && env.R2_ENDPOINT === undefined) {
        context.addIssue({
          code: "custom",
          path: ["R2_ACCOUNT_ID"],
          message: "or R2_ENDPOINT is required when STORAGE_DRIVER is r2",
        });
      }
    }
    if (env.STORAGE_DRIVER === "fs" && env.VERCEL) {
      context.addIssue({
        code: "custom",
        path: ["STORAGE_DRIVER"],
        message: "must be r2 on serverless hosting, which has no persistent disk",
      });
    }

    if (
      (env.GOOGLE_CLIENT_ID === undefined) !==
      (env.GOOGLE_CLIENT_SECRET === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "and GOOGLE_CLIENT_SECRET must be set together",
      });
    }

    const runner = runnerProvider(env);
    if (runner === undefined) {
      context.addIssue({
        code: "custom",
        path: ["RUNNER_PROVIDER"],
        message:
          "is required in production: http for the bundled runner, vercel for Vercel Sandbox",
      });
    }
    if (runner === "local" && env.NODE_ENV === "production") {
      context.addIssue({
        code: "custom",
        path: ["RUNNER_PROVIDER"],
        message: "cannot be local in production: the local runner isolates nothing",
      });
    }
    if (runner === "http") {
      require("RUNNER_URL", "when RUNNER_PROVIDER is http");
      require("RUNNER_TOKEN", "when RUNNER_PROVIDER is http");
    }
    if (runner === "vercel") {
      require("RUNNER_IMAGE_NUMPY", "when RUNNER_PROVIDER is vercel");
      require("RUNNER_IMAGE_TORCH", "when RUNNER_PROVIDER is vercel");
    }
    const vercelCredentials = [
      env.VERCEL_TEAM_ID,
      env.VERCEL_PROJECT_ID,
      env.VERCEL_TOKEN,
    ];
    if (new Set(vercelCredentials.map((value) => value === undefined)).size > 1) {
      context.addIssue({
        code: "custom",
        path: ["VERCEL_TEAM_ID"],
        message: "VERCEL_PROJECT_ID and VERCEL_TOKEN must be set together",
      });
    }

    const driver = emailDriver(env);
    if (driver === "log" && env.NODE_ENV === "production") {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_DRIVER"],
        message: "cannot be log in production: it prints sign-in links to the console",
      });
    }
    if (driver === "resend" || driver === "smtp") {
      require("EMAIL_FROM", `when EMAIL_DRIVER is ${driver}`);
    }
    if (driver === "resend") require("RESEND_API_KEY", "when EMAIL_DRIVER is resend");
    if (driver === "smtp") require("SMTP_HOST", "when EMAIL_DRIVER is smtp");
    if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "and SMTP_PASSWORD must be set together",
      });
    }
  });

type Env = z.output<typeof envSchema>;
type EmailDriver = (typeof EMAIL_DRIVERS)[number];

/** Development prints emails by default; elsewhere nothing is sent until a driver is chosen. */
function emailDriver(env: Pick<Env, "EMAIL_DRIVER" | "NODE_ENV">): EmailDriver {
  return env.EMAIL_DRIVER ?? (env.NODE_ENV === "development" ? "log" : "none");
}

/** Outside production, runs default to the local provider; production must choose. */
function runnerProvider(
  env: Pick<Env, "RUNNER_PROVIDER" | "NODE_ENV">,
): RunnerProviderName | undefined {
  return env.RUNNER_PROVIDER ?? (env.NODE_ENV === "production" ? undefined : "local");
}

type RunnerProviderName = (typeof RUNNER_PROVIDERS)[number];

/** Reads a value the schema has already made mandatory for this configuration. */
function present<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`${name} passed validation but is missing`);
  return value;
}

function storageConfig(env: Env): StorageConfig {
  if (env.STORAGE_DRIVER === "fs")
    return { driver: "fs", root: resolve(env.STORAGE_FS_PATH) };
  return {
    driver: "r2",
    accountId: env.R2_ACCOUNT_ID,
    endpoint: env.R2_ENDPOINT,
    region: env.R2_REGION,
    bucket: present(env.R2_BUCKET, "R2_BUCKET"),
    accessKeyId: present(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"),
    secretAccessKey: present(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY"),
  };
}

/** How emails leave this instance (docs/specs/06-auth.md §5). */
export type EmailConfig =
  | { driver: "none" }
  | { driver: "log" }
  | { driver: "resend"; from: string; apiKey: string }
  | {
      driver: "smtp";
      from: string;
      host: string;
      port: number;
      secure: boolean;
      auth: { user: string; password: string } | null;
    };

function emailConfig(env: Env): EmailConfig {
  const driver = emailDriver(env);
  switch (driver) {
    case "none":
    case "log":
      return { driver };
    case "resend":
      return {
        driver,
        from: present(env.EMAIL_FROM, "EMAIL_FROM"),
        apiKey: present(env.RESEND_API_KEY, "RESEND_API_KEY"),
      };
    case "smtp":
      return {
        driver,
        from: present(env.EMAIL_FROM, "EMAIL_FROM"),
        host: present(env.SMTP_HOST, "SMTP_HOST"),
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth:
          env.SMTP_USER === undefined
            ? null
            : {
                user: env.SMTP_USER,
                password: present(env.SMTP_PASSWORD, "SMTP_PASSWORD"),
              },
      };
  }
}

/** Where learners' code runs (docs/specs/07-runner.md §8). */
export type RunnerConfig =
  | { provider: "local"; pythonPath: string | null }
  | { provider: "http"; url: string; token: string }
  | {
      provider: "vercel";
      images: { numpy: string; torch: string };
      credentials: { teamId: string; projectId: string; token: string } | null;
    };

function runnerConfig(env: Env): RunnerConfig {
  const provider = present(runnerProvider(env), "RUNNER_PROVIDER");
  switch (provider) {
    case "local":
      return { provider, pythonPath: env.RUNNER_PYTHON ?? null };
    case "http":
      return {
        provider,
        url: present(env.RUNNER_URL, "RUNNER_URL"),
        token: present(env.RUNNER_TOKEN, "RUNNER_TOKEN"),
      };
    case "vercel":
      return {
        provider,
        images: {
          numpy: present(env.RUNNER_IMAGE_NUMPY, "RUNNER_IMAGE_NUMPY"),
          torch: present(env.RUNNER_IMAGE_TORCH, "RUNNER_IMAGE_TORCH"),
        },
        credentials:
          env.VERCEL_TEAM_ID === undefined
            ? null
            : {
                teamId: env.VERCEL_TEAM_ID,
                projectId: present(env.VERCEL_PROJECT_ID, "VERCEL_PROJECT_ID"),
                token: present(env.VERCEL_TOKEN, "VERCEL_TOKEN"),
              },
      };
  }
}

export interface LimitsConfig {
  /** Submissions per user per UTC day; internal errors are not counted. */
  runsPerDay: number;
  /** Submission attempts per user per minute. */
  runsPerMinute: number;
  /** Submissions per UTC day across the instance; over it, 503. */
  globalRunsPerDay: number;
  /** Writes (POST, PATCH, PUT, DELETE under /v1) per user per minute. */
  mutationsPerMinute: number;
}

export interface AuthConfig {
  /** Signs session cookies and tokens. Rotating it signs everyone out. */
  secret: string;
  /** Addresses given the admin role when they sign up (docs/specs/06-auth.md §9). Lowercase. */
  adminEmails: string[];
  /** Whether new accounts can be created. */
  signups: boolean;
  /** Whether unverified users are restricted, when an email driver exists. */
  requireEmailVerification: boolean;
  google: { clientId: string; clientSecret: string } | null;
  /** Sign-in, sign-up and reset requests per IP per window. */
  rateLimit: { max: number; windowSeconds: number };
  /** The header carrying the client's address, set by the proxy in front of the API. */
  clientIpHeader: string;
  /** Proxies allowed to append to `clientIpHeader` (addresses or CIDR ranges). */
  trustedProxies: string[];
}

export interface AppConfig {
  env: "development" | "test" | "production";
  /** Listen port for the Bun.serve entry. */
  port: number;
  /** Public origin of the web app. */
  webOrigin: string;
  logLevel: LogLevel;
  /** Reported by GET /api/health. */
  version: string;
  /** Postgres connection string. */
  databaseUrl: string;
  /** Where paper content and uploads live (docs/specs/03-content.md §2.4). */
  storage: StorageConfig;
  /** Limits enforced by the API; `runsPerDay` is published at GET /v1/config. */
  limits: LimitsConfig;
  runner: RunnerConfig;
  /** Bearer token for /api/internal/*; null switches those endpoints off. */
  internalSecret: string | null;
  auth: AuthConfig;
  email: EmailConfig;
}

/**
 * Reads and validates the environment once, at start-up. Nothing else in the
 * backend reads process.env. Throws EnvError naming every bad variable.
 */
export function loadConfig(
  source: Record<string, string | undefined> = process.env,
): AppConfig {
  const env = parseEnv(envSchema, source, {
    app: "backend",
    exampleFile: "apps/backend/.env.example",
  });
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    webOrigin: env.WEB_ORIGIN,
    logLevel: env.LOG_LEVEL,
    version: env.APP_VERSION ?? env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev",
    databaseUrl: env.DATABASE_URL,
    storage: storageConfig(env),
    limits: {
      runsPerDay: env.RUNS_PER_DAY,
      runsPerMinute: env.RUNS_PER_MINUTE,
      globalRunsPerDay: env.GLOBAL_RUNS_PER_DAY,
      mutationsPerMinute: env.MUTATIONS_PER_MINUTE,
    },
    runner: runnerConfig(env),
    internalSecret: env.INTERNAL_SECRET ?? null,
    auth: {
      secret: env.BETTER_AUTH_SECRET,
      adminEmails: env.ADMIN_EMAILS.map((email) => email.toLowerCase()),
      signups: env.ALLOW_SIGNUPS,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
      google:
        env.GOOGLE_CLIENT_ID === undefined
          ? null
          : {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: present(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
            },
      rateLimit: {
        max: env.AUTH_RATE_LIMIT_MAX,
        windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      },
      clientIpHeader: env.CLIENT_IP_HEADER,
      trustedProxies: env.TRUSTED_PROXIES,
    },
    email: emailConfig(env),
  };
}

/** Whether this instance verifies email addresses (docs/specs/13-self-hosting.md §4). */
export function verifiesEmail(config: Pick<AppConfig, "auth" | "email">): boolean {
  return config.email.driver !== "none" && config.auth.requireEmailVerification;
}
