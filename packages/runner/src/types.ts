import { runEnvironmentSchema } from "@repo/shared";
import { z } from "zod";

/** Run only public tests, or public and hidden tests (docs/specs/07-runner.md §3). */
export { submissionModeSchema, type SubmissionMode } from "@repo/shared";

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

/** Paths a request may write: a module or a test module, nothing else (docs/specs/07-runner.md §4). */
export const RUN_FILE_PATH = /^(tests\/)?[a-z0-9_]+\.py$/;

/** Paths the provider owns. A request may not overwrite them. */
export const RESERVED_PATHS: ReadonlySet<string> = new Set([
  "harness.py",
  "conftest.py",
  "spec.json",
  "result.json",
  "events.jsonl",
  "pytest.log",
]);

/** Largest file a request may carry, and how many: far above any problem's needs. */
export const MAX_RUN_FILE_BYTES = 1024 * 1024;
export const MAX_RUN_FILES = 16;

/** Run ids name containers and directories, so they are restricted to safe characters. */
export const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

const harnessSpecSchema = z.strictObject({
  action: z.enum(["test", "inspect"]),
  entryPoint: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  allowedPackages: z.array(z.string().max(100)).max(50),
  prohibitedImports: z.array(z.string().max(100)).max(50),
  hasHelpers: z.boolean(),
  perTestTimeoutSeconds: z.number().int().min(1).max(60),
  memoryLimitMb: z.number().int().min(16).max(8192),
  wallClockLimitSeconds: z.number().int().min(1).max(60),
  applyMemoryLimit: z.boolean(),
  applyProcessLimit: z.boolean(),
  inspectFiles: z.array(z.string().regex(RUN_FILE_PATH)).max(MAX_RUN_FILES),
}) satisfies z.ZodType<HarnessSpec>;

/**
 * A `RunRequest` received over the network, by the bundled runner service.
 * Paths are checked here so no provider can be made to write outside its
 * working directory or over the harness.
 */
export const runRequestSchema = z.strictObject({
  runId: z.string().regex(RUN_ID_PATTERN, "must be letters, digits, '.', '_' or '-'"),
  environment: runEnvironmentSchema,
  files: z
    .array(
      z.strictObject({
        path: z
          .string()
          .regex(RUN_FILE_PATH, "must be a Python module, optionally under tests/")
          .refine((path) => !RESERVED_PATHS.has(path), "is reserved for the harness"),
        content: z.string().max(MAX_RUN_FILE_BYTES),
      }),
    )
    .min(1)
    .max(MAX_RUN_FILES)
    .refine(
      (files) => new Set(files.map((file) => file.path)).size === files.length,
      "must not repeat a path",
    ),
  spec: harnessSpecSchema,
}) satisfies z.ZodType<RunRequest>;

/** Throws unless every file path is one a request may write. */
export function assertRunFiles(files: readonly RunFile[]): void {
  for (const file of files) {
    if (!RUN_FILE_PATH.test(file.path) || RESERVED_PATHS.has(file.path)) {
      throw new Error(`Invalid run file path ${JSON.stringify(file.path)}`);
    }
  }
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
