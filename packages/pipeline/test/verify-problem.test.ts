import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { defaultLocalPythonPath, LocalProvider } from "@repo/runner";
import { verifyProblem, type CheckId, type VerifiableProblem } from "../src";

// Each test drives real Python runs; under parallel load they need more than the default 5 s.
setDefaultTimeout(60_000);

const pythonPath = process.env.RUNNER_PYTHON || defaultLocalPythonPath();
const hasPython = (() => {
  try {
    return Bun.spawnSync([pythonPath, "-c", "import numpy, pytest"]).exitCode === 0;
  } catch {
    return false;
  }
})();
if (process.env.CI && !hasPython)
  throw new Error(`CI: ${pythonPath} lacks numpy and pytest.`);

const provider = new LocalProvider({ pythonPath, nodeEnv: "test" });

const good: VerifiableProblem = {
  ref: "fixture/relu",
  entryPoint: "relu",
  environment: "numpy",
  allowedPackages: ["numpy"],
  prohibitedImports: ["torch"],
  timeLimitSeconds: 2,
  memoryLimitMb: 256,
  description: "Implement $\\max(0, x)$ for every element; keep `x.shape`.\n",
  tutorial: null,
  starter: "def relu(x):\n    raise NotImplementedError\n",
  solution: "import numpy as np\n\n\ndef relu(x):\n    return np.maximum(x, 0)\n",
  helpers: null,
  testsPublic: `import numpy as np
from solution import relu


def test_zeroes_negative_values():
    assert np.array_equal(relu(np.array([-1.0, 2.0])), np.array([0.0, 2.0])), "negatives should become 0"


def test_keeps_the_shape():
    assert relu(np.zeros((2, 3))).shape == (2, 3), "the shape should be kept"
`,
  testsHidden: `import numpy as np
from solution import relu


def test_integers():
    assert np.array_equal(relu(np.arange(-3, 3)), np.array([0, 0, 0, 0, 1, 2])), "integers should work"


def test_positive_values_unchanged():
    assert np.array_equal(relu(np.array([0.5])), np.array([0.5])), "positives should be unchanged"


def test_empty_input():
    assert relu(np.array([])).size == 0, "an empty array should stay empty"
`,
};

async function failedChecks(problem: VerifiableProblem): Promise<CheckId[]> {
  const report = await verifyProblem(problem, { provider });
  return report.checks.filter((c) => c.status === "failed").map((c) => c.id);
}

describe.skipIf(!hasPython)("verifyProblem", () => {
  test("a well-made problem passes every check", async () => {
    const report = await verifyProblem(good, { provider });
    expect(report.passed).toBe(true);
    expect(report.checks.map((c) => [c.id, c.status])).toEqual([
      ["V1", "passed"],
      ["V2", "passed"],
      ["V3", "passed"],
      ["V4", "passed"],
      ["V5", "passed"],
      ["V6", "passed"],
      ["V10", "passed"],
    ]);
    expect(report.runs).toBe(5);
  });

  test("V2 catches a wrong reference solution and names the failing tests", async () => {
    const report = await verifyProblem(
      { ...good, solution: "def relu(x):\n    return x\n" },
      { provider },
    );
    const v2 = report.checks.find((c) => c.id === "V2");
    expect(v2?.status).toBe("failed");
    expect(v2?.details.some((d) => d.includes("test_zeroes_negative_values"))).toBe(true);
    expect(report.checks.find((c) => c.id === "V6")?.status).toBe("skipped");
  });

  test("V3 catches a starter that already passes", async () => {
    expect(await failedChecks({ ...good, starter: good.solution })).toEqual(["V3"]);
  });

  test("V1 and V3 catch a starter that does not parse", async () => {
    expect(await failedChecks({ ...good, starter: "def relu(x)\n" })).toEqual([
      "V1",
      "V3",
    ]);
  });

  test("V1 catches a missing entry point and raw HTML", async () => {
    const problem = {
      ...good,
      starter: "def rectify(x):\n    raise NotImplementedError\n",
      description: "<b>no</b>\n",
    };
    const report = await verifyProblem(problem, { provider });
    const v1 = report.checks.find((c) => c.id === "V1");
    expect(v1?.details).toContain("starter.py does not define `relu`");
    expect(v1?.details.some((d) => d.startsWith("description.md line 1: raw HTML"))).toBe(
      true,
    );
  });

  test("V4 catches a solution that uses a forbidden library", async () => {
    const solution = "import torch\n\n\ndef relu(x):\n    return x\n";
    expect(await failedChecks({ ...good, solution })).toEqual(["V2", "V4"]);
  });

  test("V5 catches a test that uses more than half the time limit", async () => {
    const testsPublic = `${good.testsPublic}\n\ndef test_slow():\n    import time\n    time.sleep(1.2)\n    assert True, "slow"\n`;
    expect(await failedChecks({ ...good, testsPublic })).toEqual(["V5"]);
  });

  test("V6 catches tests whose outcome changes between runs", async () => {
    const marker = `/tmp/verify-flaky-${crypto.randomUUID()}`;
    const testsPublic = `${good.testsPublic}
import os

def test_flaky():
    count = int(open("${marker}").read()) if os.path.exists("${marker}") else 0
    open("${marker}", "w").write(str(count + 1))
    assert count == 0, "passes only the first time it runs"
`;
    try {
      expect(await failedChecks({ ...good, testsPublic })).toEqual(["V6"]);
    } finally {
      await Bun.file(marker)
        .delete()
        .catch(() => {});
    }
  });

  test("V10 catches missing assertion messages and too few hidden tests", async () => {
    const testsHidden =
      "from solution import relu\n\n\ndef test_one():\n    assert relu(1) == 1\n";
    const report = await verifyProblem({ ...good, testsHidden }, { provider });
    const v10 = report.checks.find((c) => c.id === "V10");
    expect(v10?.details).toContain("hidden tests: 1, expected at least 3");
    expect(v10?.details).toContain(
      "tests/test_hidden.py line 5: assert without a message",
    );
  });
});
