import { describe, expect, test } from "bun:test";
import { charactersLeft, ratingLabel } from "@/lib/feedback/format";

describe("ratingLabel", () => {
  test("names the rating out of five, or nothing", () => {
    expect(ratingLabel(4)).toBe("4 out of 5");
    expect(ratingLabel(null)).toBeNull();
  });
});

describe("charactersLeft", () => {
  test("counts trimmed characters against the limit", () => {
    expect(charactersLeft("  hello  ", 10)).toBe("5 characters left");
    expect(charactersLeft("x".repeat(12), 10)).toBe("2 characters too many");
  });
});
