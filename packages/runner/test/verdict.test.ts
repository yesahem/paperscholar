import { describe, expect, test } from "bun:test";
import { buildRunRequest, toVerdict, type RunResult, type TestResult } from "../src";
import { reluProblem } from "./fixtures";

const testResult = (overrides: Partial<TestResult>): TestResult => ({
  name: "test_x",
  group: "public",
  status: "passed",
  durationMs: 1,
  message: null,
  traceback: null,
  stdout: null,
  timedOut: false,
  ...overrides,
});

const result = (overrides: Partial<RunResult>): RunResult => ({
  outcome: "completed",
  tests: [],
  violations: [],
  errorOutput: null,
  durationMs: 10,
  ...overrides,
});

describe("toVerdict", () => {
  test("all tests passing is passed", () => {
    expect(toVerdict(result({ tests: [testResult({}), testResult({})] }))).toEqual({
      status: "completed",
      verdict: "passed",
      testsPassed: 2,
      testsTotal: 2,
    });
  });

  test("any failure is failed, unless every failure is a time limit", () => {
    const failed = testResult({ status: "failed" });
    const slow = testResult({ status: "failed", timedOut: true });
    expect(toVerdict(result({ tests: [testResult({}), failed] })).verdict).toBe("failed");
    expect(toVerdict(result({ tests: [testResult({}), slow] })).verdict).toBe(
      "time_limit_exceeded",
    );
    expect(toVerdict(result({ tests: [slow, failed] })).verdict).toBe("failed");
  });

  test("outcomes map to their verdicts", () => {
    expect(toVerdict(result({ outcome: "timeout" })).verdict).toBe("time_limit_exceeded");
    expect(toVerdict(result({ outcome: "out_of_memory" })).verdict).toBe(
      "memory_limit_exceeded",
    );
    expect(toVerdict(result({ outcome: "import_violation" })).verdict).toBe(
      "import_violation",
    );
    expect(toVerdict(result({ outcome: "collection_error" })).verdict).toBe(
      "runtime_error",
    );
  });

  test("our own failures are errors, never the learner's", () => {
    expect(toVerdict(result({ outcome: "harness_error" }))).toMatchObject({
      status: "error",
      verdict: "internal_error",
    });
    expect(toVerdict(result({ tests: [] }))).toMatchObject({
      status: "error",
      verdict: "internal_error",
    });
  });
});

describe("buildRunRequest", () => {
  test("hidden tests are sent only when submitting", () => {
    const paths = (mode: "run" | "submit") =>
      buildRunRequest(reluProblem, { runId: "r", code: "x", mode }).files.map(
        (f) => f.path,
      );
    expect(paths("run")).toEqual(["solution.py", "tests/test_public.py"]);
    expect(paths("submit")).toEqual([
      "solution.py",
      "tests/test_public.py",
      "tests/test_hidden.py",
    ]);
  });

  test("the PyTorch environment skips the address-space limit", () => {
    const torch = buildRunRequest(
      { ...reluProblem, environment: "torch" },
      { runId: "r", code: "x", mode: "run" },
    );
    const numpy = buildRunRequest(reluProblem, { runId: "r", code: "x", mode: "run" });
    expect(torch.spec.applyMemoryLimit).toBe(false);
    expect(numpy.spec.applyMemoryLimit).toBe(true);
  });
});
