import type { RunResult } from "./types";

export const VERDICTS = [
  "passed",
  "failed",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "import_violation",
  "runtime_error",
  "internal_error",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface VerdictResult {
  /** `error` means the run failed for reasons that are ours, not the learner's. */
  status: "completed" | "error";
  verdict: Verdict;
  testsPassed: number;
  testsTotal: number;
}

/** Maps a harness result to a verdict. Table: docs/specs/07-runner.md §7. */
export function toVerdict(result: RunResult): VerdictResult {
  const testsTotal = result.tests.length;
  const testsPassed = result.tests.filter((test) => test.status === "passed").length;
  const done = (verdict: Verdict): VerdictResult => ({
    status: "completed",
    verdict,
    testsPassed,
    testsTotal,
  });

  switch (result.outcome) {
    case "import_violation":
      return done("import_violation");
    case "collection_error":
      return done("runtime_error");
    case "timeout":
      return done("time_limit_exceeded");
    case "out_of_memory":
      return done("memory_limit_exceeded");
    case "harness_error":
      return { status: "error", verdict: "internal_error", testsPassed, testsTotal };
    case "completed": {
      if (testsTotal === 0) {
        return { status: "error", verdict: "internal_error", testsPassed, testsTotal };
      }
      const failures = result.tests.filter((test) => test.status !== "passed");
      if (failures.length === 0) return done("passed");
      if (failures.every((test) => test.timedOut)) return done("time_limit_exceeded");
      return done("failed");
    }
  }
}
