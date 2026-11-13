import { describe, expect, test } from "bun:test";
import { EnvError } from "@repo/shared";
import { DEFAULT_PORT, loadConfig } from "../src/env";

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
    });
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
});
