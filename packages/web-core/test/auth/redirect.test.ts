import { describe, expect, test } from "bun:test";
import { safeNextPath } from "../../src/auth/redirect";

describe("safeNextPath", () => {
  test("keeps a path on this site, with its query and hash", () => {
    expect(safeNextPath("/papers/adam?tab=2#top", "/")).toBe("/papers/adam?tab=2#top");
  });

  test("falls back for anything that leaves the site or is missing", () => {
    for (const value of [
      null,
      undefined,
      "",
      "papers",
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(value, "/home")).toBe("/home");
    }
  });
});
