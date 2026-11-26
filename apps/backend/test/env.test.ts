import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { EnvError } from "@repo/shared";
import {
  DEFAULT_AUTH_RATE_LIMIT_MAX,
  DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS,
  DEFAULT_LLM_MODEL,
  DEFAULT_PORT,
  DEFAULT_RUNS_PER_DAY,
  loadConfig,
  verifiesEmail,
} from "../src/env";
import { TEST_PIPELINE_LIMITS } from "./helpers";

const SECRET = "x".repeat(32);
const DATABASE_URL = "postgres://u:p@localhost:5432/db";
const valid = {
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL,
  BETTER_AUTH_SECRET: SECRET,
};

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    loadConfig(source);
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig: the CMS origin", () => {
  test("is optional and read as an origin", () => {
    expect(loadConfig(valid).cmsOrigin).toBeNull();
    expect(loadConfig({ ...valid, CMS_ORIGIN: "http://localhost:3001/" }).cmsOrigin).toBe(
      "http://localhost:3001",
    );
    expect(loadConfig({ ...valid, CMS_ORIGIN: "" }).cmsOrigin).toBeNull();
  });

  test("a bad value names the variable", () => {
    expect(problemsFor({ ...valid, CMS_ORIGIN: "not a url" }).join("\n")).toContain(
      "CMS_ORIGIN",
    );
  });
});

describe("loadConfig", () => {
  test("applies defaults for optional variables", () => {
    expect(loadConfig(valid)).toEqual({
      env: "development",
      port: DEFAULT_PORT,
      webOrigin: "http://localhost:3000",
      cmsOrigin: null,
      logLevel: "info",
      version: "dev",
      databaseUrl: DATABASE_URL,
      storage: { driver: "fs", root: resolve(".storage") },
      avatars: { driver: "fs" },
      limits: {
        runsPerDay: DEFAULT_RUNS_PER_DAY,
        runsPerMinute: 10,
        globalRunsPerDay: 20_000,
        mutationsPerMinute: 60,
        examAttemptsPerDay: 20,
        feedbackPerDay: 10,
      },
      runner: { provider: "local", pythonPath: null },
      internalSecret: null,
      auth: {
        secret: SECRET,
        adminEmails: [],
        signups: true,
        requireEmailVerification: true,
        google: null,
        rateLimit: {
          max: DEFAULT_AUTH_RATE_LIMIT_MAX,
          windowSeconds: DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS,
        },
        clientIpHeader: "x-forwarded-for",
        trustedProxies: [],
      },
      // Development prints emails instead of sending them.
      email: { driver: "log" },
      // No model, no pipeline.
      pipeline: { llm: null, enabled: false, limits: TEST_PIPELINE_LIMITS },
      courses: { enabled: true },
      coldMail: { enabled: true, perDay: 5 },
    });
  });

  test("cold mail: FEATURE_COLD_MAIL and COLD_MAILS_PER_DAY", () => {
    expect(
      loadConfig({ ...valid, FEATURE_COLD_MAIL: "false", COLD_MAILS_PER_DAY: "2" })
        .coldMail,
    ).toEqual({ enabled: false, perDay: 2 });
    expect(problemsFor({ ...valid, COLD_MAILS_PER_DAY: "0" })[0]).toStartWith(
      "COLD_MAILS_PER_DAY",
    );
  });

  test("FEATURE_COURSES=false switches courses off", () => {
    expect(loadConfig({ ...valid, FEATURE_COURSES: "false" }).courses).toEqual({
      enabled: false,
    });
  });

  test("reads the daily run allowance and rejects a non-positive one", () => {
    expect(loadConfig({ ...valid, RUNS_PER_DAY: "25" }).limits.runsPerDay).toBe(25);
    expect(problemsFor({ ...valid, RUNS_PER_DAY: "0" })).toEqual([
      "RUNS_PER_DAY must be at least 1",
    ]);
  });

  test("names every missing required variable", () => {
    expect(problemsFor({}).sort()).toEqual([
      "BETTER_AUTH_SECRET is required",
      "DATABASE_URL is required",
      "WEB_ORIGIN is required",
    ]);
  });

  test("treats an empty value as unset", () => {
    expect(problemsFor({ ...valid, WEB_ORIGIN: "  " })).toEqual([
      "WEB_ORIGIN is required",
    ]);
    expect(loadConfig({ ...valid, PORT: "" }).port).toBe(DEFAULT_PORT);
  });

  test("rejects an origin with a path and normalises a trailing slash", () => {
    expect(
      problemsFor({ ...valid, WEB_ORIGIN: "https://example.com/app" })[0],
    ).toStartWith("WEB_ORIGIN must be an origin");
    expect(loadConfig({ ...valid, WEB_ORIGIN: "https://example.com/" }).webOrigin).toBe(
      "https://example.com",
    );
  });

  test("rejects non-http origins and bad ports, reporting every problem", () => {
    const problems = problemsFor({
      ...valid,
      WEB_ORIGIN: "ftp://example.com",
      PORT: "99999",
    });
    expect(problems).toHaveLength(2);
    expect(problems.some((p) => p.startsWith("WEB_ORIGIN"))).toBe(true);
    expect(problems.some((p) => p.startsWith("PORT"))).toBe(true);
  });

  test("the error message lists problems and points at the example file", () => {
    expect(() => loadConfig({})).toThrow(
      /Invalid backend environment[\s\S]*WEB_ORIGIN is required[\s\S]*apps\/backend\/\.env\.example/,
    );
  });

  test("version prefers APP_VERSION, then the deployment commit", () => {
    expect(loadConfig({ ...valid, APP_VERSION: "1.2.3" }).version).toBe("1.2.3");
    expect(
      loadConfig({ ...valid, VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123" }).version,
    ).toBe("0123456789ab");
  });

  test("r2 storage needs credentials, a bucket and an account or endpoint", () => {
    expect(problemsFor({ ...valid, STORAGE_DRIVER: "r2" }).sort()).toEqual([
      "R2_ACCESS_KEY_ID is required when STORAGE_DRIVER is r2",
      "R2_ACCOUNT_ID or R2_ENDPOINT is required when STORAGE_DRIVER is r2",
      "R2_BUCKET is required when STORAGE_DRIVER is r2",
      "R2_PUBLIC_BUCKET is required when STORAGE_DRIVER is r2 (avatars)",
      "R2_PUBLIC_URL is required when STORAGE_DRIVER is r2 (avatars)",
      "R2_SECRET_ACCESS_KEY is required when STORAGE_DRIVER is r2",
    ]);
    const config = loadConfig({
      ...valid,
      STORAGE_DRIVER: "r2",
      R2_ACCOUNT_ID: "acc123",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "paperscholar-content",
      R2_PUBLIC_BUCKET: "paperscholar-public",
      R2_PUBLIC_URL: "https://avatars.example.com/",
    });
    expect(config.avatars).toEqual({
      driver: "r2",
      bucket: "paperscholar-public",
      publicUrl: "https://avatars.example.com",
    });
    expect(config.storage).toEqual({
      driver: "r2",
      accountId: "acc123",
      endpoint: undefined,
      region: "auto",
      bucket: "paperscholar-content",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
  });

  test("avatars are served by the API with the fs driver", () => {
    expect(loadConfig(valid).avatars).toEqual({ driver: "fs" });
  });

  test("serverless hosting refuses the local-disk driver", () => {
    expect(problemsFor({ ...valid, VERCEL: "1" })).toEqual([
      "STORAGE_DRIVER must be r2 on serverless hosting, which has no persistent disk",
    ]);
  });

  test("the database URL must be a postgres URL", () => {
    expect(problemsFor({ ...valid, DATABASE_URL: "mysql://x" })).toEqual([
      "DATABASE_URL must be a postgres:// connection URL",
    ]);
    expect(loadConfig(valid).databaseUrl).toBe(DATABASE_URL);
  });

  test("the auth secret must be long enough", () => {
    expect(problemsFor({ ...valid, BETTER_AUTH_SECRET: "short" })[0]).toStartWith(
      "BETTER_AUTH_SECRET must be at least 32 characters",
    );
  });

  test("reads admin emails, lowercased, and rejects anything else", () => {
    expect(
      loadConfig({ ...valid, ADMIN_EMAILS: "Ada@Example.com, grace@example.com" }).auth
        .adminEmails,
    ).toEqual(["ada@example.com", "grace@example.com"]);
    expect(problemsFor({ ...valid, ADMIN_EMAILS: "ada" })[0]).toStartWith("ADMIN_EMAILS");
  });

  test("reads the sign-up and verification switches", () => {
    const config = loadConfig({
      ...valid,
      ALLOW_SIGNUPS: "false",
      REQUIRE_EMAIL_VERIFICATION: "false",
    });
    expect(config.auth.signups).toBe(false);
    expect(config.auth.requireEmailVerification).toBe(false);
    expect(problemsFor({ ...valid, ALLOW_SIGNUPS: "no" })).toEqual([
      "ALLOW_SIGNUPS must be true or false",
    ]);
  });

  test("Google needs both its client id and secret", () => {
    expect(problemsFor({ ...valid, GOOGLE_CLIENT_ID: "id" })).toEqual([
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    ]);
    expect(
      loadConfig({ ...valid, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" })
        .auth.google,
    ).toEqual({ clientId: "id", clientSecret: "secret" });
  });

  test("email: log in development, none elsewhere, never log in production", () => {
    expect(loadConfig({ ...valid, NODE_ENV: "test" }).email).toEqual({ driver: "none" });
    expect(
      problemsFor({
        ...valid,
        NODE_ENV: "production",
        EMAIL_DRIVER: "log",
        RUNNER_PROVIDER: "vercel",
        RUNNER_IMAGE_NUMPY: "n",
        RUNNER_IMAGE_TORCH: "t",
      }),
    ).toEqual([
      "EMAIL_DRIVER cannot be log in production: it prints sign-in links to the console",
    ]);
  });

  test("email drivers name what they are missing", () => {
    expect(problemsFor({ ...valid, EMAIL_DRIVER: "resend" }).sort()).toEqual([
      "EMAIL_FROM is required when EMAIL_DRIVER is resend",
      "RESEND_API_KEY is required when EMAIL_DRIVER is resend",
    ]);
    expect(problemsFor({ ...valid, EMAIL_DRIVER: "smtp" }).sort()).toEqual([
      "EMAIL_FROM is required when EMAIL_DRIVER is smtp",
      "SMTP_HOST is required when EMAIL_DRIVER is smtp",
    ]);
    expect(
      loadConfig({
        ...valid,
        EMAIL_DRIVER: "smtp",
        EMAIL_FROM: "PaperScholar <no-reply@example.com>",
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "user",
        SMTP_PASSWORD: "password",
      }).email,
    ).toEqual({
      driver: "smtp",
      from: "PaperScholar <no-reply@example.com>",
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "user", password: "password" },
    });
  });

  test("verifiesEmail needs a sender and the switch on", () => {
    expect(verifiesEmail(loadConfig({ ...valid, NODE_ENV: "test" }))).toBe(false);
    expect(verifiesEmail(loadConfig(valid))).toBe(true);
    expect(
      verifiesEmail(loadConfig({ ...valid, REQUIRE_EMAIL_VERIFICATION: "false" })),
    ).toBe(false);
  });
});

describe("runner configuration", () => {
  const token = "r".repeat(32);

  test("development runs code locally by default", () => {
    expect(loadConfig(valid).runner).toEqual({ provider: "local", pythonPath: null });
    expect(loadConfig({ ...valid, RUNNER_PYTHON: "/opt/py/bin/python" }).runner).toEqual({
      provider: "local",
      pythonPath: "/opt/py/bin/python",
    });
  });

  test("production must choose an isolating provider", () => {
    const production = { ...valid, NODE_ENV: "production" };
    expect(problemsFor(production)).toContain(
      "RUNNER_PROVIDER is required in production: http for the bundled runner, vercel for Vercel Sandbox",
    );
    expect(problemsFor({ ...production, RUNNER_PROVIDER: "local" })).toContain(
      "RUNNER_PROVIDER cannot be local in production: the local runner isolates nothing",
    );
  });

  test("http needs the runner's URL and a long token", () => {
    expect(problemsFor({ ...valid, RUNNER_PROVIDER: "http" })).toEqual([
      "RUNNER_URL is required when RUNNER_PROVIDER is http",
      "RUNNER_TOKEN is required when RUNNER_PROVIDER is http",
    ]);
    expect(
      problemsFor({
        ...valid,
        RUNNER_PROVIDER: "http",
        RUNNER_URL: "http://runner:8798",
        RUNNER_TOKEN: "short",
      })[0],
    ).toStartWith("RUNNER_TOKEN must be at least 32 characters");
    expect(
      loadConfig({
        ...valid,
        RUNNER_PROVIDER: "http",
        RUNNER_URL: "http://runner:8798",
        RUNNER_TOKEN: token,
      }).runner,
    ).toEqual({ provider: "http", url: "http://runner:8798", token });
  });

  test("vercel needs both images; access-token credentials come as a set", () => {
    expect(problemsFor({ ...valid, RUNNER_PROVIDER: "vercel" })).toEqual([
      "RUNNER_IMAGE_NUMPY is required when RUNNER_PROVIDER is vercel",
      "RUNNER_IMAGE_TORCH is required when RUNNER_PROVIDER is vercel",
    ]);
    const images = {
      RUNNER_PROVIDER: "vercel",
      RUNNER_IMAGE_NUMPY: "n:1",
      RUNNER_IMAGE_TORCH: "t:1",
    };
    expect(loadConfig({ ...valid, ...images }).runner).toEqual({
      provider: "vercel",
      images: { numpy: "n:1", torch: "t:1" },
      credentials: null,
    });
    expect(problemsFor({ ...valid, ...images, VERCEL_TOKEN: "tok" })).toEqual([
      "VERCEL_TEAM_ID VERCEL_PROJECT_ID and VERCEL_TOKEN must be set together",
    ]);
  });

  test("limits and the internal secret", () => {
    const config = loadConfig({
      ...valid,
      RUNS_PER_MINUTE: "5",
      GLOBAL_RUNS_PER_DAY: "1000",
      MUTATIONS_PER_MINUTE: "30",
      EXAM_ATTEMPTS_PER_DAY: "3",
      FEEDBACK_PER_DAY: "2",
      INTERNAL_SECRET: "i".repeat(32),
    });
    expect(config.limits).toEqual({
      runsPerDay: 100,
      runsPerMinute: 5,
      globalRunsPerDay: 1000,
      mutationsPerMinute: 30,
      examAttemptsPerDay: 3,
      feedbackPerDay: 2,
    });
    expect(problemsFor({ ...valid, EXAM_ATTEMPTS_PER_DAY: "0" })[0]).toStartWith(
      "EXAM_ATTEMPTS_PER_DAY",
    );
    expect(config.internalSecret).toBe("i".repeat(32));
    expect(problemsFor({ ...valid, INTERNAL_SECRET: "short" })[0]).toStartWith(
      "INTERNAL_SECRET must be at least 32",
    );
  });
});

describe("pipeline configuration", () => {
  test("an Anthropic key turns the pipeline on with the default model", () => {
    const config = loadConfig({ ...valid, ANTHROPIC_API_KEY: "sk-test" });
    expect(config.pipeline).toEqual({
      llm: { driver: "anthropic", apiKey: "sk-test", model: DEFAULT_LLM_MODEL },
      enabled: true,
      limits: TEST_PIPELINE_LIMITS,
    });
    expect(
      loadConfig({ ...valid, ANTHROPIC_API_KEY: "k", FEATURE_PIPELINE: "false" }).pipeline
        .enabled,
    ).toBe(false);
    expect(
      loadConfig({ ...valid, ANTHROPIC_API_KEY: "k", LLM_MODEL: "claude-sonnet-5-5" })
        .pipeline.llm,
    ).toMatchObject({ model: "claude-sonnet-5-5" });
  });

  test("the fake model is for development only, and anthropic needs its key", () => {
    expect(loadConfig({ ...valid, LLM_DRIVER: "fake" }).pipeline).toMatchObject({
      llm: { driver: "fake" },
      enabled: true,
    });
    expect(
      problemsFor({
        ...valid,
        NODE_ENV: "production",
        RUNNER_PROVIDER: "http",
        RUNNER_URL: "http://runner:8798",
        RUNNER_TOKEN: SECRET,
        LLM_DRIVER: "fake",
      }),
    ).toEqual([
      "LLM_DRIVER cannot be fake in production: it writes the same demonstration paper every time",
    ]);
    expect(problemsFor({ ...valid, LLM_DRIVER: "anthropic" })).toEqual([
      "ANTHROPIC_API_KEY is required when LLM_DRIVER is anthropic",
    ]);
  });

  test("reads the limits and checks the step range", () => {
    const { limits } = loadConfig({
      ...valid,
      PIPELINE_MAX_PDF_MB: "10",
      PIPELINE_INGESTIONS_PER_DAY: "3",
      PIPELINE_OUTPUT_TOKEN_BUDGET: "1000",
    }).pipeline;
    expect(limits).toMatchObject({
      maxPdfBytes: 10 * 1024 * 1024,
      ingestionsPerDay: 3,
      outputTokenBudget: 1000,
    });
    expect(
      problemsFor({ ...valid, PIPELINE_MIN_STEPS: "8", PIPELINE_MAX_STEPS: "5" }),
    ).toEqual(["PIPELINE_MIN_STEPS must not be more than PIPELINE_MAX_STEPS"]);
  });
});
