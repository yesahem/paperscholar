import type { RunEnvironment } from "@repo/shared";
import type { HarnessSpec, RunRequest, SubmissionMode } from "./types";

/** Hard cap on one run, in seconds (docs/specs/07-runner.md §9). */
export const WALL_CLOCK_LIMIT_SECONDS = 60;

/** Everything about a problem the runner needs. Kept structural so the runner knows nothing of content storage. */
export interface RunnableProblem {
  entryPoint: string;
  environment: RunEnvironment;
  allowedPackages: string[];
  prohibitedImports: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  testsPublic: string;
  testsHidden: string;
  helpers: string | null;
}

export interface BuildRunOptions {
  runId: string;
  /** Code under test: a learner's submission, a reference solution, a starter or a mutant. */
  code: string;
  mode: SubmissionMode;
  /** Enforce the process-count limit; true only under a dedicated sandbox user. */
  applyProcessLimit?: boolean;
}

function baseSpec(
  problem: RunnableProblem,
  applyProcessLimit: boolean,
): Omit<HarnessSpec, "action" | "inspectFiles"> {
  return {
    entryPoint: problem.entryPoint,
    allowedPackages: problem.allowedPackages,
    prohibitedImports: problem.prohibitedImports,
    hasHelpers: problem.helpers !== null,
    perTestTimeoutSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    wallClockLimitSeconds: WALL_CLOCK_LIMIT_SECONDS,
    applyMemoryLimit: problem.environment !== "torch",
    applyProcessLimit,
  };
}

/**
 * The run for one piece of code against a problem's tests. Hidden tests are
 * included only in `submit` mode; the reference solution is never included.
 */
export function buildRunRequest(
  problem: RunnableProblem,
  { runId, code, mode, applyProcessLimit = false }: BuildRunOptions,
): RunRequest {
  const files = [
    { path: "solution.py", content: code },
    { path: "tests/test_public.py", content: problem.testsPublic },
  ];
  if (mode === "submit")
    files.push({ path: "tests/test_hidden.py", content: problem.testsHidden });
  if (problem.helpers !== null)
    files.push({ path: "helpers.py", content: problem.helpers });

  return {
    runId,
    environment: problem.environment,
    files,
    spec: { ...baseSpec(problem, applyProcessLimit), action: "test", inspectFiles: [] },
  };
}

/** A run that only parses `files` and reports their structure. Nothing is executed. */
export function buildInspectRequest(
  problem: RunnableProblem,
  runId: string,
  files: { path: string; content: string }[],
): RunRequest {
  return {
    runId,
    environment: problem.environment,
    files,
    spec: {
      ...baseSpec(problem, false),
      action: "inspect",
      inspectFiles: files.map((file) => file.path),
    },
  };
}
