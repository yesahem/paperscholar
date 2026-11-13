import { httpOriginSchema, parseEnv } from "@repo/shared";
import { z } from "zod";
import type { LogLevel } from "./lib/logger";

/** Default listen port for Bun.serve. Chosen to avoid the common 8787/8080. */
export const DEFAULT_PORT = 8797;

const envSchema = z.object({
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
});

export interface AppConfig {
  env: "development" | "test" | "production";
  /** Listen port for the Bun.serve entry. */
  port: number;
  /** Public origin of the web app. */
  webOrigin: string;
  logLevel: LogLevel;
  /** Reported by GET /api/health. */
  version: string;
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
  };
}
