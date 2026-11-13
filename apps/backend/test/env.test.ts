import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { EnvError } from "@repo/shared";
import {
  DEFAULT_AUTH_RATE_LIMIT_MAX,
  DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS,
  DEFAULT_PORT,
  DEFAULT_RUNS_PER_DAY,
  loadConfig,
  verifiesEmail,
} from "../src/env";

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

describe("loadConfig", () => {
  test("applies defaults for optional variables", () => {
    expect(loadConfig(valid)).toEqual({
      env: "development",
      port: DEFAULT_PORT,
      webOrigin: "http://localhost:3000",
      logLevel: "info",
      version: "dev",
      databaseUrl: DATABASE_URL,
      storage: { driver: "fs", root: resolve(".storage") },
      limits: { runsPerDay: DEFAULT_RUNS_PER_DAY },
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
      "R2_SECRET_ACCESS_KEY is required when STORAGE_DRIVER is r2",
    ]);
    const config = loadConfig({
      ...valid,
      STORAGE_DRIVER: "r2",
      R2_ACCOUNT_ID: "acc123",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "paperscholar-content",
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
      problemsFor({ ...valid, NODE_ENV: "production", EMAIL_DRIVER: "log" }),
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
