import { EnvError, parseEnv, requiredOr } from "@repo/shared";
import type { LogLevel } from "@repo/shared/logger";
import type { RunEnvironment } from "@repo/shared";
import { z } from "zod";

export const DEFAULT_PORT = 8798;
/** Shortest accepted RUNNER_TOKEN. */
export const MIN_TOKEN_LENGTH = 32;

const count = (min: number, fallback: number) =>
  z.coerce
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(min, `must be at least ${min}`)
    .default(fallback);

const envSchema = z.object({
  PORT: z.coerce
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(1, "must be between 1 and 65535")
    .max(65535, "must be between 1 and 65535")
    .default(DEFAULT_PORT),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RUNNER_TOKEN: z
    .string({ error: requiredOr("must be a string") })
    .min(
      MIN_TOKEN_LENGTH,
      `must be at least ${MIN_TOKEN_LENGTH} characters (openssl rand -hex 32)`,
    ),
  RUNNER_IMAGE_NUMPY: z.string().trim().min(1).default("paperscholar-sandbox-numpy"),
  RUNNER_IMAGE_TORCH: z.string().trim().min(1).default("paperscholar-sandbox-torch"),
  RUNNER_DOCKER_RUNTIME: z
    .string()
    .trim()
    .regex(/^[a-z0-9_.-]+$/, "must be a runtime name such as runsc")
    .optional(),
  RUNNER_MAX_CONCURRENT: count(1, 2),
  RUNNER_MAX_QUEUE: count(0, 20),
  RUNNER_CPUS: z.coerce
    .number({ error: "must be a number" })
    .positive("must be above 0")
    .max(16, "must be at most 16")
    .default(1),
  DOCKER_BIN: z.string().trim().min(1).default("docker"),
  DOCKER_HOST: z.string().trim().min(1).optional(),
  PATH: z.string().default("/usr/local/bin:/usr/bin:/bin"),
});

export interface RunnerConfig {
  port: number;
  logLevel: LogLevel;
  /** Bearer token the backend presents. */
  token: string;
  images: Record<RunEnvironment, string>;
  /** A sandboxed container runtime such as gVisor's `runsc`, or null for Docker's default. */
  runtime: string | null;
  /** Containers running at once; further runs wait. */
  maxConcurrent: number;
  /** Runs allowed to wait; beyond that the service answers 503. */
  maxQueue: number;
  /** CPUs per run container. */
  cpus: number;
  docker: { bin: string; host: string | null; path: string };
}

/** Reads and validates the environment once. Nothing else reads process.env. */
export function loadConfig(
  source: Record<string, string | undefined> = process.env,
): RunnerConfig {
  const env = parseEnv(envSchema, source, {
    app: "runner",
    exampleFile: "apps/runner/.env.example",
  });
  return {
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    token: env.RUNNER_TOKEN,
    images: { numpy: env.RUNNER_IMAGE_NUMPY, torch: env.RUNNER_IMAGE_TORCH },
    runtime: env.RUNNER_DOCKER_RUNTIME ?? null,
    maxConcurrent: env.RUNNER_MAX_CONCURRENT,
    maxQueue: env.RUNNER_MAX_QUEUE,
    cpus: env.RUNNER_CPUS,
    docker: { bin: env.DOCKER_BIN, host: env.DOCKER_HOST ?? null, path: env.PATH },
  };
}

/** Like `loadConfig`, but prints every problem and exits instead of throwing. */
export function loadConfigOrExit(): RunnerConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
