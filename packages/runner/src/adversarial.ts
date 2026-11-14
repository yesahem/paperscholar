import { buildRunRequest, type RunnableProblem } from "./build-request";
import { reluProblem, reluSolution, reluStarter } from "./testing";
import type { RunResult, SandboxProvider } from "./types";
import { toVerdict } from "./verdict";

/**
 * The adversarial submissions every production provider must contain
 * (docs/specs/07-runner.md §10). Run with `bun run runner:adversarial`
 * against the bundled runner or the hosted sandbox; several cases would harm
 * the machine running them under the local provider, which isolates nothing.
 */

export interface CaseOutcome {
  passed: boolean;
  /** What happened, for the report. */
  detail: string;
}

export interface AdversarialCase {
  name: string;
  expected: string;
  /** Harmless without isolation, so the local provider's tests can exercise it. */
  safeWithoutIsolation: boolean;
  run(provider: SandboxProvider, runId: string): Promise<CaseOutcome>;
}

/** A problem whose public tests are `testsPublic`: test files are not import-scanned. */
function withTests(testsPublic: string): RunnableProblem {
  return { ...reluProblem, testsPublic, timeLimitSeconds: 10 };
}

function describeResult(result: RunResult): string {
  const { verdict, testsPassed, testsTotal } = toVerdict(result);
  const first = result.tests.find((test) => test.status !== "passed");
  return [
    `${verdict} (${result.outcome}), ${testsPassed}/${testsTotal} passed, ${result.durationMs} ms`,
    result.violations.length > 0 ? `violations: ${result.violations.join(", ")}` : null,
    result.errorOutput ? `error: ${result.errorOutput.split("\n")[0]}` : null,
    first?.message ? `first failure: ${first.message.split("\n")[0]}` : null,
  ]
    .filter((part) => part !== null)
    .join("; ");
}

function expectVerdict(
  name: string,
  expected: string,
  code: string,
  check: (result: RunResult) => boolean,
  options: { problem?: RunnableProblem; mode?: "run" | "submit"; safe?: boolean } = {},
): AdversarialCase {
  return {
    name,
    expected,
    safeWithoutIsolation: options.safe ?? true,
    async run(provider, runId) {
      const result = await provider.run(
        buildRunRequest(options.problem ?? reluProblem, {
          runId,
          code,
          mode: options.mode ?? "submit",
        }),
      );
      return { passed: check(result), detail: describeResult(result) };
    },
  };
}

const verdictIs = (verdict: string) => (result: RunResult) =>
  toVerdict(result).verdict === verdict;
const allTestsPass = (result: RunResult) => toVerdict(result).verdict === "passed";

const NETWORK_TESTS = `import socket


def test_no_route_to_a_public_address():
    try:
        socket.create_connection(("1.1.1.1", 80), timeout=5).close()
    except OSError:
        return
    raise AssertionError("connected to 1.1.1.1:80")


def test_no_name_resolution():
    try:
        socket.getaddrinfo("example.com", 443)
    except OSError:
        return
    raise AssertionError("resolved example.com")
`;

const FORK_BOMB_TESTS = `import os


def test_fork_bomb():
    while True:
        try:
            os.fork()
        except OSError:
            pass
`;

const WRITE_TESTS = `def test_leaves_files_behind():
    with open("/tmp/paperscholar-leftover", "w") as handle:
        handle.write("from an earlier run")
    with open("leftover.txt", "w") as handle:
        handle.write("from an earlier run")
`;

const READ_TESTS = `import os


def test_earlier_files_are_gone():
    for path in ("/tmp/paperscholar-leftover", "leftover.txt"):
        assert not os.path.exists(path), path + " survived from an earlier run"
`;

const ENVIRONMENT_TESTS = `import os
import re

SECRET_LIKE = re.compile(r"SECRET|TOKEN|PASSWORD|KEY|DATABASE|VERCEL|AWS|R2_|SMTP|RESEND|GOOGLE|AUTH", re.I)


def test_no_secrets_in_the_environment():
    leaked = sorted(name for name in os.environ if SECRET_LIKE.search(name))
    assert not leaked, "secret-like variables present: " + ", ".join(leaked)
`;

const PRINT_100_MB = `import numpy as np


def relu(x):
    chunk = "x" * 1_000_000
    for _ in range(100):
        print(chunk)
    return np.maximum(x, 0)
`;

export const ADVERSARIAL_CASES: readonly AdversarialCase[] = [
  expectVerdict("Reference solution", "passed", reluSolution, allTestsPass),
  expectVerdict("Starter code", "failed", reluStarter, verdictIs("failed")),
  expectVerdict(
    "while True: pass",
    "time_limit_exceeded, total time under 75 s",
    "def relu(x):\n    while True:\n        pass\n",
    (result) => verdictIs("time_limit_exceeded")(result) && result.durationMs < 75_000,
  ),
  expectVerdict(
    "Allocates 10 GB",
    "memory_limit_exceeded",
    "import numpy as np\n\n\ndef relu(x):\n    big = np.ones(10 * 1024**3 // 8)\n    return np.maximum(x, 0) + big[0] * 0\n",
    verdictIs("memory_limit_exceeded"),
    { safe: false },
  ),
  expectVerdict(
    "import torch on a NumPy-only problem",
    "import_violation listing torch",
    "import torch\n\n\ndef relu(x):\n    return torch.relu(x)\n",
    (result) =>
      verdictIs("import_violation")(result) &&
      result.violations.some((v) => v.includes("torch")),
  ),
  expectVerdict(
    '__import__("os").system("id")',
    "import_violation",
    'def relu(x):\n    __import__("os").system("id")\n    return x\n',
    verdictIs("import_violation"),
  ),
  expectVerdict(
    "Syntax error",
    "runtime_error with the error text",
    "def relu(x)\n    return x\n",
    (result) =>
      verdictIs("runtime_error")(result) &&
      (result.errorOutput ?? "").includes("SyntaxError"),
  ),
  expectVerdict(
    "Opens a socket to a public address (in a test file, past the import scan)",
    "connection fails",
    reluSolution,
    allTestsPass,
    { problem: withTests(NETWORK_TESTS), mode: "run", safe: false },
  ),
  expectVerdict(
    "Prints 100 MB",
    "completes; output truncated",
    PRINT_100_MB,
    (result) =>
      result.outcome === "completed" &&
      result.tests.every((test) => (test.stdout?.length ?? 0) <= 4096),
  ),
  {
    name: "Fork bomb",
    expected: "contained; verdict is not passed; next run unaffected",
    safeWithoutIsolation: false,
    async run(provider, runId) {
      const bomb = await provider.run(
        buildRunRequest(withTests(FORK_BOMB_TESTS), {
          runId,
          code: reluSolution,
          mode: "run",
        }),
      );
      const after = await provider.run(
        buildRunRequest(reluProblem, {
          runId: `${runId}-after`,
          code: reluSolution,
          mode: "submit",
        }),
      );
      return {
        passed: toVerdict(bomb).verdict !== "passed" && allTestsPass(after),
        detail: `bomb: ${describeResult(bomb)}. Next run: ${describeResult(after)}`,
      };
    },
  },
  {
    name: "Writes a file, then a second run looks for it",
    expected: "file absent",
    // It writes to /tmp, which persists on an unisolated machine.
    safeWithoutIsolation: false,
    async run(provider, runId) {
      const write = await provider.run(
        buildRunRequest(withTests(WRITE_TESTS), {
          runId,
          code: reluSolution,
          mode: "run",
        }),
      );
      const read = await provider.run(
        buildRunRequest(withTests(READ_TESTS), {
          runId: `${runId}-read`,
          code: reluSolution,
          mode: "run",
        }),
      );
      return {
        passed: allTestsPass(write) && allTestsPass(read),
        detail: `write: ${describeResult(write)}. Read: ${describeResult(read)}`,
      };
    },
  },
  expectVerdict(
    "Reads environment variables",
    "none of ours present",
    reluSolution,
    allTestsPass,
    { problem: withTests(ENVIRONMENT_TESTS), mode: "run" },
  ),
];

export interface AdversarialReport {
  name: string;
  expected: string;
  passed: boolean;
  detail: string;
}

/** Runs every case in order (some depend on a previous run) and reports each. */
export async function runAdversarialSuite(
  provider: SandboxProvider,
  options: {
    cases?: readonly AdversarialCase[];
    onCase?: (report: AdversarialReport) => void;
  } = {},
): Promise<AdversarialReport[]> {
  const reports: AdversarialReport[] = [];
  const prefix = `adversarial-${Date.now().toString(36)}`;
  for (const [index, entry] of (options.cases ?? ADVERSARIAL_CASES).entries()) {
    let outcome: CaseOutcome;
    try {
      outcome = await entry.run(provider, `${prefix}-${index}`);
    } catch (error) {
      outcome = {
        passed: false,
        detail: `the provider threw: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const report = { name: entry.name, expected: entry.expected, ...outcome };
    reports.push(report);
    options.onCase?.(report);
  }
  return reports;
}
