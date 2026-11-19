import { describe, expect, test } from "bun:test";
import { isStatusOf } from "../src/feedback";

describe("isStatusOf", () => {
  test("reviews are pending, approved or rejected; bug reports open or resolved", () => {
    expect(isStatusOf("review", "approved")).toBe(true);
    expect(isStatusOf("review", "resolved")).toBe(false);
    expect(isStatusOf("bug", "resolved")).toBe(true);
    expect(isStatusOf("bug", "approved")).toBe(false);
  });
});
