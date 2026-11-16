import { describe, expect, test } from "bun:test";
import { cacheHitShare, totalUsage } from "@/lib/dashboard/totals";

const day = (overrides: Partial<ReturnType<typeof totalUsage>> = {}) => ({
  date: "2026-11-16",
  ingestions: 0,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  sandboxRuns: 0,
  ...overrides,
});

describe("totalUsage", () => {
  test("sums every column", () => {
    expect(
      totalUsage([
        day({ ingestions: 1, calls: 10, inputTokens: 100, outputTokens: 50 }),
        day({ ingestions: 2, calls: 5, cacheReadTokens: 300, sandboxRuns: 7 }),
      ]),
    ).toEqual({
      ingestions: 3,
      calls: 15,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 300,
      sandboxRuns: 7,
    });
  });

  test("an empty window is all zero", () => {
    expect(totalUsage([]).outputTokens).toBe(0);
  });
});

describe("cacheHitShare", () => {
  test("is cache reads over all input, and null with no input", () => {
    expect(
      cacheHitShare(totalUsage([day({ inputTokens: 100, cacheReadTokens: 300 })])),
    ).toBe(0.75);
    expect(cacheHitShare(totalUsage([]))).toBeNull();
  });
});
