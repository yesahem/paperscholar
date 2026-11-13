import { findRawHtml } from "@repo/content";
import {
  buildInspectRequest,
  buildRunRequest,
  toVerdict,
  type InspectedFile,
  type RunnableProblem,
  type RunResult,
  type SandboxProvider,
  type SubmissionMode,
} from "@repo/runner";
import {
  CHECKS,
  type CheckId,
  type CheckResult,
  type VerifiableProblem,
  type VerificationReport,
} from "./types";

/** Public tests: enough to reason about, few enough to read (docs/specs/09-paper-pipeline.md §7). */
export const PUBLIC_TEST_RANGE = { min: 2, max: 6 } as const;
export const MIN_HIDDEN_TESTS = 3;
/** Extra runs of the solution, on top of V2's, to check determinism. */
const DETERMINISM_RUNS = 2;
const MAX_DETAILS = 8;

export interface VerifyOptions {
  provider: SandboxProvider;
  signal?: AbortSignal;
}

function toRunnable(problem: VerifiableProblem): RunnableProblem {
  return {
    entryPoint: problem.entryPoint,
    environment: problem.environment,
    allowedPackages: problem.allowedPackages,
    prohibitedImports: problem.prohibitedImports,
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    testsPublic: problem.testsPublic,
    testsHidden: problem.testsHidden,
    helpers: problem.helpers,
  };
}

function check(id: CheckId, details: string[], skipped = false): CheckResult {
  return {
    id,
    name: CHECKS[id],
    status: skipped ? "skipped" : details.length === 0 ? "passed" : "failed",
    details: details.slice(0, MAX_DETAILS),
  };
}

function describeRun(result: RunResult): string {
  const verdict = toVerdict(result);
  if (result.outcome === "import_violation")
    return `import violation: ${result.violations.join(", ")}`;
  if (result.outcome !== "completed") {
    return `${result.outcome.replaceAll("_", " ")}${result.errorOutput ? `: ${result.errorOutput.split("\n")[0]}` : ""}`;
  }
  return `${verdict.testsPassed}/${verdict.testsTotal} tests passed`;
}

function failingTests(result: RunResult): string[] {
  return result.tests
    .filter((test) => test.status !== "passed")
    .map((test) => `${test.group} ${test.name}: ${test.message ?? test.status}`);
}

/** Per-test outcome, for comparing runs. */
function signature(result: RunResult): string {
  if (result.outcome !== "completed") return result.outcome;
  return result.tests
    .map((test) => `${test.group}/${test.name}=${test.status}`)
    .sort()
    .join(",");
}

function checkWellFormed(problem: VerifiableProblem, files: InspectedFile[]): string[] {
  const details: string[] = [];
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const file of files) {
    if (file.syntaxError)
      details.push(`${file.path}: ${file.syntaxError.split("\n")[0]}`);
  }
  for (const path of ["starter.py", "solution.py"]) {
    const file = byPath.get(path);
    if (file && !file.syntaxError && !file.definitions.includes(problem.entryPoint)) {
      details.push(`${path} does not define \`${problem.entryPoint}\``);
    }
  }
  for (const path of ["tests/test_public.py", "tests/test_hidden.py"]) {
    const file = byPath.get(path);
    if (file && !file.syntaxError && !file.imports.includes("solution")) {
      details.push(`${path} does not import from solution`);
    }
  }
  for (const [name, markdown] of [
    ["description.md", problem.description],
    ["tutorial.md", problem.tutorial],
  ] as const) {
    for (const match of findRawHtml(markdown ?? "")) {
      details.push(`${name} line ${match.line}: raw HTML ${match.html}`);
    }
  }
  return details;
}

function checkHygiene(files: InspectedFile[]): string[] {
  const details: string[] = [];
  const publicTests = files.find((file) => file.path === "tests/test_public.py");
  const hiddenTests = files.find((file) => file.path === "tests/test_hidden.py");
  const publicCount = publicTests?.testFunctions.length ?? 0;
  const hiddenCount = hiddenTests?.testFunctions.length ?? 0;
  if (publicCount < PUBLIC_TEST_RANGE.min || publicCount > PUBLIC_TEST_RANGE.max) {
    details.push(
      `public tests: ${publicCount}, expected ${PUBLIC_TEST_RANGE.min}–${PUBLIC_TEST_RANGE.max}`,
    );
  }
  if (hiddenCount < MIN_HIDDEN_TESTS) {
    details.push(`hidden tests: ${hiddenCount}, expected at least ${MIN_HIDDEN_TESTS}`);
  }
  for (const file of [publicTests, hiddenTests]) {
    for (const assertion of file?.asserts ?? []) {
      if (!assertion.hasMessage)
        details.push(`${file?.path} line ${assertion.line}: assert without a message`);
    }
  }
  return details;
}

/**
 * Proves a problem works by running it in the sandbox: the reference solution
 * passes, the starter does not, imports obey the policy, tests are fast and
 * deterministic, and the files are well-formed and hygienic. One function for
 * content:verify, the pipeline and the review screen (docs/specs/03-content.md §8).
 */
export async function verifyProblem(
  problem: VerifiableProblem,
  { provider, signal }: VerifyOptions,
): Promise<VerificationReport> {
  const started = performance.now();
  const runnable = toRunnable(problem);
  const runId = problem.ref.replace(/[^a-z0-9-]/g, "-");
  let runs = 0;
  const run = (code: string, mode: SubmissionMode, label: string) => {
    runs += 1;
    return provider.run(
      buildRunRequest(runnable, { runId: `${runId}-${label}`, code, mode }),
      signal,
    );
  };

  const inspectFiles = [
    { path: "starter.py", content: problem.starter },
    { path: "solution.py", content: problem.solution },
    { path: "tests/test_public.py", content: problem.testsPublic },
    { path: "tests/test_hidden.py", content: problem.testsHidden },
    ...(problem.helpers === null
      ? []
      : [{ path: "helpers.py", content: problem.helpers }]),
  ];
  runs += 1;
  const inspection = await provider.run(
    buildInspectRequest(runnable, `${runId}-inspect`, inspectFiles),
    signal,
  );
  const files = inspection.inspection?.files ?? [];
  const inspected =
    inspection.outcome === "completed" && files.length === inspectFiles.length;

  const v1 = inspected
    ? checkWellFormed(problem, files)
    : [`inspection failed: ${describeRun(inspection)}`];
  const v10 = inspected ? checkHygiene(files) : ["inspection failed"];

  const solutionRun = await run(problem.solution, "submit", "solution-1");
  const solutionPassed = toVerdict(solutionRun).verdict === "passed";

  const v4 =
    solutionRun.outcome === "import_violation"
      ? [
          `the solution imports what the problem forbids: ${solutionRun.violations.join(", ")}`,
        ]
      : [];
  const v2 = solutionPassed
    ? []
    : [describeRun(solutionRun), ...failingTests(solutionRun)];

  const starterRun = await run(problem.starter, "run", "starter");
  const starterVerdict = toVerdict(starterRun).verdict;
  const v3 =
    starterVerdict === "failed" || starterVerdict === "time_limit_exceeded"
      ? []
      : starterVerdict === "passed"
        ? ["the starter already passes the public tests"]
        : [`the starter must fail by its tests, not by ${describeRun(starterRun)}`];

  const budgetMs = (problem.timeLimitSeconds * 1000) / 2;
  const v5 = solutionPassed
    ? solutionRun.tests
        .filter((test) => test.durationMs >= budgetMs)
        .map(
          (test) =>
            `${test.name} took ${Math.round(test.durationMs)} ms; limit for verification is ${budgetMs} ms`,
        )
    : [];

  const v6: string[] = [];
  if (solutionPassed) {
    const expected = signature(solutionRun);
    for (let attempt = 2; attempt <= DETERMINISM_RUNS + 1; attempt += 1) {
      const repeat = await run(problem.solution, "submit", `solution-${attempt}`);
      if (signature(repeat) !== expected) {
        v6.push(
          `run ${attempt} differed: ${describeRun(repeat)}${failingTests(repeat).length ? `; ${failingTests(repeat).join("; ")}` : ""}`,
        );
      }
    }
  }

  const checks = [
    check("V1", v1),
    check("V2", v2),
    check("V3", v3),
    check("V4", v4),
    check("V5", v5, !solutionPassed),
    check("V6", v6, !solutionPassed),
    check("V10", v10),
  ];
  return {
    ref: problem.ref,
    passed: checks.every((result) => result.status === "passed"),
    checks,
    runs,
    durationMs: Math.round(performance.now() - started),
  };
}
