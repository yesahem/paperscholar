import { runResultSchema, type RunResult } from "../types";

/** A result for a run that failed for reasons that are ours, not the learner's. */
export function harnessError(message: string, durationMs = 0): RunResult {
  return {
    outcome: "harness_error",
    tests: [],
    violations: [],
    errorOutput: message,
    durationMs,
  };
}

/**
 * Reads the text of `result.json`. It was written inside the sandbox, so it is
 * untrusted: anything that is not valid JSON of the right shape is a harness
 * error, never a verdict.
 */
export function parseHarnessResult(text: string, durationMs: number): RunResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return harnessError("The harness wrote a result that is not valid JSON.", durationMs);
  }
  const parsed = runResultSchema.safeParse(raw);
  return parsed.success
    ? parsed.data
    : harnessError("The harness wrote a result in an unexpected shape.", durationMs);
}
