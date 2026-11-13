import { runEnvironmentSchema } from "@repo/shared";
import { z } from "zod";

/** Run only public tests, or public and hidden tests (docs/specs/07-runner.md §3). */
export const submissionModeSchema = z.enum(["run", "submit"]);
export type SubmissionMode = z.infer<typeof submissionModeSchema>;

export interface RunFile {
  /** Path relative to the sandbox working directory, e.g. `tests/test_public.py`. */
  path: string;
  content: string;
}

/** Limits and import policy the harness enforces. Written to spec.json. */
export interface HarnessSpec {
  action: "test" | "inspect";
  entryPoint: string;
  allowedPackages: string[];
  prohibitedImports: string[];
  hasHelpers: boolean;
  perTestTimeoutSeconds: number;
  memoryLimitMb: number;
  wallClockLimitSeconds: number;
  /** Address-space limit. Off for PyTorch, which reserves far more than it uses. */
  applyMemoryLimit: boolean;
  /** Process-count limit. Only meaningful under a dedicated sandbox user. */
  applyProcessLimit: boolean;
  /** Files to parse when `action` is `inspect`. */
  inspectFiles: string[];
}

export interface RunRequest {
  /** Correlates logs; a submission id or a verification run id. */
  runId: string;
  environment: z.infer<typeof runEnvironmentSchema>;
  /** solution.py, tests, optional helpers.py. The harness files are added by the provider. */
  files: RunFile[];
  spec: HarnessSpec;
}

export const testResultSchema = z.object({
  name: z.string(),
  group: z.enum(["public", "hidden"]),
  status: z.enum(["passed", "failed", "error"]),
  durationMs: z.number().nonnegative(),
  message: z.string().nullable(),
  traceback: z.string().nullable(),
  stdout: z.string().nullable(),
  /** The test hit the per-test time limit. */
  timedOut: z.boolean(),
});
export type TestResult = z.infer<typeof testResultSchema>;

export const inspectedFileSchema = z.object({
  path: z.string(),
  syntaxError: z.string().nullable(),
  /** Top-level function and class names. */
  definitions: z.array(z.string()),
  /** Top-level module names imported anywhere in the file. */
  imports: z.array(z.string()),
  /** Top-level functions named test_*. */
  testFunctions: z.array(z.string()),
  asserts: z.array(z.object({ line: z.number().int(), hasMessage: z.boolean() })),
});
export type InspectedFile = z.infer<typeof inspectedFileSchema>;

export const RUN_OUTCOMES = [
  "completed",
  "import_violation",
  "collection_error",
  "timeout",
  "out_of_memory",
  "harness_error",
] as const;

/**
 * What the harness reports. Produced inside the sandbox, so it is validated
 * like any other untrusted input (docs/specs/07-runner.md §4).
 */
export const runResultSchema = z.object({
  outcome: z.enum(RUN_OUTCOMES),
  tests: z.array(testResultSchema),
  violations: z.array(z.string()),
  errorOutput: z.string().nullable(),
  durationMs: z.number().nonnegative(),
  inspection: z.object({ files: z.array(inspectedFileSchema) }).optional(),
});
export type RunResult = z.infer<typeof runResultSchema>;
export type RunOutcome = RunResult["outcome"];

/** Executes one run in isolation. Implementations: docs/specs/07-runner.md §8. */
export interface SandboxProvider {
  readonly name: string;
  run(request: RunRequest, signal?: AbortSignal): Promise<RunResult>;
}
