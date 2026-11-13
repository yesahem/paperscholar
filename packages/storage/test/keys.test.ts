import { describe, expect, test } from "bun:test";
import { assertValidKey, contentTypeForKey, InvalidKeyError } from "../src";

describe("assertValidKey", () => {
  test("accepts relative keys made of simple segments", () => {
    for (const key of [
      "content/index.json",
      "content/papers/attention/v12/private.json",
      "a",
      "x@2.json",
    ]) {
      expect(() => assertValidKey(key)).not.toThrow();
    }
  });

  test("rejects traversal, absolute paths, empty and hidden segments", () => {
    for (const key of [
      "",
      "..",
      "a/../b",
      "/a",
      "a/",
      "a//b",
      ".env",
      "a/.tmp-1",
      "a\\b",
      "a b",
    ]) {
      expect(() => assertValidKey(key)).toThrow(InvalidKeyError);
    }
  });

  test("rejects keys over 512 characters", () => {
    expect(() => assertValidKey("a".repeat(513))).toThrow(InvalidKeyError);
  });
});

describe("contentTypeForKey", () => {
  test("maps known extensions and returns null otherwise", () => {
    expect(contentTypeForKey("content/index.json")).toBe("application/json");
    expect(contentTypeForKey("x/paper.PDF")).toBe("application/pdf");
    expect(contentTypeForKey("x/unknown.bin")).toBeNull();
  });
});
