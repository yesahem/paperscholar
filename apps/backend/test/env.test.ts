import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { EnvError } from "@repo/shared";
import { DEFAULT_PORT, DEFAULT_RUNS_PER_DAY, loadConfig } from "../src/env";

const valid = { WEB_ORIGIN: "http://localhost:3000" };

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
      databaseUrl: null,
      storage: { driver: "fs", root: resolve(".storage") },
      limits: { runsPerDay: DEFAULT_RUNS_PER_DAY },
    });
  });

  test("reads the daily run allowance and rejects a non-positive one", () => {
    expect(loadConfig({ ...valid, RUNS_PER_DAY: "25" }).limits.runsPerDay).toBe(25);
    expect(problemsFor({ ...valid, RUNS_PER_DAY: "0" })).toEqual([
      "RUNS_PER_DAY must be at least 1",
    ]);
  });

  test("names a missing required variable", () => {
    expect(problemsFor({})).toEqual(["WEB_ORIGIN is required"]);
  });

  test("treats an empty value as unset", () => {
    expect(problemsFor({ WEB_ORIGIN: "  " })).toEqual(["WEB_ORIGIN is required"]);
    expect(loadConfig({ ...valid, PORT: "" }).port).toBe(DEFAULT_PORT);
  });

  test("rejects an origin with a path and normalises a trailing slash", () => {
    expect(problemsFor({ WEB_ORIGIN: "https://example.com/app" })[0]).toStartWith(
      "WEB_ORIGIN must be an origin",
    );
    expect(loadConfig({ WEB_ORIGIN: "https://example.com/" }).webOrigin).toBe(
      "https://example.com",
    );
  });

  test("rejects non-http origins and bad ports, reporting every problem", () => {
    const problems = problemsFor({ WEB_ORIGIN: "ftp://example.com", PORT: "99999" });
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
    expect(
      loadConfig({ ...valid, DATABASE_URL: "postgres://u:p@localhost:5432/db" })
        .databaseUrl,
    ).toBe("postgres://u:p@localhost:5432/db");
  });
});
