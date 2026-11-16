import { describe, expect, test } from "bun:test";
import { EnvError } from "@repo/shared";
import { loadCmsEnv } from "@/lib/env";

const valid = {
  API_ORIGIN: "http://localhost:8797",
  NEXT_PUBLIC_CMS_URL: "http://localhost:3001",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    loadCmsEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
  throw new Error("expected loadCmsEnv to throw");
}

describe("loadCmsEnv", () => {
  test("reads the three required origins and leaves the upload origin unset", () => {
    expect(loadCmsEnv(valid)).toEqual(valid);
  });

  test("an upload origin is read as an origin", () => {
    expect(
      loadCmsEnv({ ...valid, UPLOAD_ORIGIN: "https://acct.r2.cloudflarestorage.com/" })
        .UPLOAD_ORIGIN,
    ).toBe("https://acct.r2.cloudflarestorage.com");
    expect(loadCmsEnv({ ...valid, UPLOAD_ORIGIN: "" }).UPLOAD_ORIGIN).toBeUndefined();
  });

  test("names every missing or bad variable", () => {
    const problems = problemsFor({ NEXT_PUBLIC_SITE_URL: "not a url" }).join("\n");
    expect(problems).toContain("API_ORIGIN");
    expect(problems).toContain("NEXT_PUBLIC_CMS_URL");
    expect(problems).toContain("NEXT_PUBLIC_SITE_URL");
  });
});
