import { describe, expect, test } from "bun:test";
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  test("keeps a path on this site, with its query and fragment", () => {
    expect(safeNextPath("/papers/attention?tab=1#steps")).toBe(
      "/papers/attention?tab=1#steps",
    );
  });

  test("falls back for anything that could leave the site", () => {
    for (const value of [
      null,
      undefined,
      "",
      "papers",
      "//evil.example/papers",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(value)).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });
});
