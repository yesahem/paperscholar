import { describe, expect, test } from "bun:test";
import {
  formatDuration,
  retryWhen,
  timedOutTests,
  verdictHeadline,
} from "@/lib/submissions/describe";

describe("verdictHeadline", () => {
  test("counts tests for passed and failed; names the other verdicts", () => {
    expect(verdictHeadline({ verdict: "passed", testsPassed: 5, testsTotal: 5 })).toBe(
      "5/5 tests passed",
    );
    expect(verdictHeadline({ verdict: "failed", testsPassed: 2, testsTotal: 5 })).toBe(
      "2/5 tests passed",
    );
    expect(
      verdictHeadline({ verdict: "import_violation", testsPassed: 0, testsTotal: 0 }),
    ).toBe("Import not allowed");
  });
});

describe("timedOutTests", () => {
  const base = { group: "public" as const, durationMs: 1, traceback: null, stdout: null };
  test("names the tests that hit their own limit, or null for the whole run", () => {
    expect(
      timedOutTests({
        tests: [
          {
            ...base,
            name: "test_a",
            status: "failed",
            message: "Time limit exceeded (2 s)",
          },
          { ...base, name: "test_b", status: "failed", message: "wrong" },
        ],
      }),
    ).toEqual(["test_a"]);
    expect(timedOutTests({ tests: [] })).toBeNull();
    expect(timedOutTests({ tests: null })).toBeNull();
  });
});

describe("formatting", () => {
  test("durations and retry times", () => {
    expect(formatDuration(340)).toBe("340 ms");
    expect(formatDuration(1234)).toBe("1.2 s");
    expect(formatDuration(null)).toBe("");
    expect(retryWhen(42, null)).toBe("in 42 seconds");
    expect(retryWhen(600, null)).toBe("in 10 minutes");
    expect(retryWhen(null, "2026-11-15T00:00:00.000Z")).toBe("after 00:00 UTC");
    expect(retryWhen(null, null)).toBe("shortly");
  });
});
