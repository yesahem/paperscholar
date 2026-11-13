import { describe, expect, test } from "bun:test";
import { CONTENT_TAGS, slugSchema } from "../src";

describe("slugSchema", () => {
  test("accepts lowercase hyphenated ids", () => {
    for (const id of ["attention-is-all-you-need", "adam", "v2-step-3"]) {
      expect(slugSchema.safeParse(id).success).toBe(true);
    }
  });

  test("rejects other shapes", () => {
    for (const id of [
      "",
      "Adam",
      "two--hyphens",
      "-leading",
      "trailing-",
      "under_score",
      "a".repeat(65),
    ]) {
      expect(slugSchema.safeParse(id).success).toBe(false);
    }
  });
});

test("the tag list is sorted and unique", () => {
  expect([...CONTENT_TAGS]).toEqual([...new Set(CONTENT_TAGS)].sort());
});
