import { httpOriginSchema, parseEnv } from "@repo/shared";
import type { StorageConfig } from "@repo/storage";
import { resolve } from "node:path";
import { z } from "zod";
import type { LogLevel } from "./lib/logger";

/** Default listen port for Bun.serve. Chosen to avoid the common 8787/8080. */
export const DEFAULT_PORT = 8797;

/** Default daily run allowance per user (docs/specs/11-security-ops.md §3). */
export const DEFAULT_RUNS_PER_DAY = 100;

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
    APP_VERSION: z.string().trim().min(1).optional(),
    VERCEL_GIT_COMMIT_SHA: z.string().trim().min(1).optional(),
    /** Set by Vercel. Serverless hosting has no persistent disk. */
    VERCEL: z.string().optional(),

    DATABASE_URL: z
      .url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// connection URL" })
      .optional(),

    RUNS_PER_DAY: z.coerce
      .number({ error: "must be a number" })
      .int("must be a whole number")
      .min(1, "must be at least 1")
      .default(DEFAULT_RUNS_PER_DAY),

    STORAGE_DRIVER: z.enum(["fs", "r2"]).default("fs"),
    STORAGE_FS_PATH: z.string().trim().min(1).default(".storage"),
    R2_ACCOUNT_ID: z.string().trim().min(1).optional(),
    R2_ENDPOINT: z
      .url({ protocol: /^https?$/, error: "must be an http(s) URL" })
      .optional(),
    R2_REGION: z.string().trim().min(1).default("auto"),
    R2_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
    R2_BUCKET: z.string().trim().min(1).optional(),
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
  });

type Env = z.output<typeof envSchema>;

/** Reads a value the schema has already made mandatory for this configuration. */
function present(value: string | undefined, name: string): string {
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

export interface AppConfig {
  env: "development" | "test" | "production";
  /** Listen port for the Bun.serve entry. */
  port: number;
  /** Public origin of the web app. */
  webOrigin: string;
  logLevel: LogLevel;
  /** Reported by GET /api/health. */
  version: string;
  /** Postgres connection string, when configured. Required by commands and, from M3, by the server. */
  databaseUrl: string | null;
  /** Where paper content and uploads live (docs/specs/03-content.md §2.4). */
  storage: StorageConfig;
  /** Limits published at GET /v1/config and enforced from M4. */
  limits: {
    runsPerDay: number;
  };
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
    databaseUrl: env.DATABASE_URL ?? null,
    storage: storageConfig(env),
    limits: { runsPerDay: env.RUNS_PER_DAY },
  };
}
