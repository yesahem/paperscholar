import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  buildInspectRequest,
  buildRunRequest,
  LocalProvider,
  toVerdict,
  type RunnableProblem,
} from "../src";
import {
  hasNumpyEnvironment,
  hasTorchEnvironment,
  pythonPath,
  reluProblem,
  reluSolution,
  reluStarter,
} from "./fixtures";

// Each test drives real Python runs; under parallel load they need more than the default 5 s.
setDefaultTimeout(60_000);

const provider = new LocalProvider({ pythonPath, nodeEnv: "test" });

async function run(
  code: string,
  mode: "run" | "submit" = "submit",
  problem: RunnableProblem = reluProblem,
) {
  return provider.run(buildRunRequest(problem, { runId: "test", code, mode }));
}

describe.skipIf(!hasNumpyEnvironment)("local provider with the harness", () => {
  test("the reference solution passes public and hidden tests", async () => {
    const result = await run(reluSolution);
    expect(toVerdict(result)).toEqual({
      status: "completed",
      verdict: "passed",
      testsPassed: 4,
      testsTotal: 4,
    });
    expect(result.tests.map((t) => t.group).sort()).toEqual([
      "hidden",
      "hidden",
      "public",
      "public",
    ]);
  });

  test("run mode executes only the public tests", async () => {
    const result = await run(reluSolution, "run");
    expect(result.tests.every((t) => t.group === "public")).toBe(true);
    expect(result.tests).toHaveLength(2);
  });

  test("the starter fails with NotImplementedError", async () => {
    const result = await run(reluStarter, "run");
    expect(toVerdict(result).verdict).toBe("failed");
    expect(result.tests.every((t) => t.message?.startsWith("NotImplementedError"))).toBe(
      true,
    );
  });

  test("public failures show detail; hidden failures show only the author's message", async () => {
    const wrong = "def relu(x):\n    print('debug output')\n    return x * 1\n";
    const result = await run(wrong);
    const publicFailure = result.tests.find(
      (t) => t.name === "test_zeroes_negative_values",
    );
    const hiddenFailure = result.tests.find(
      (t) => t.name === "test_handles_integer_ranges",
    );

    expect(publicFailure?.status).toBe("failed");
    expect(publicFailure?.traceback).toContain("test_public.py");
    expect(publicFailure?.stdout).toContain("debug output");

    expect(hiddenFailure).toMatchObject({
      status: "failed",
      message: "integer inputs should be clipped at 0",
      traceback: null,
      stdout: null,
    });
  });

  test("an infinite loop in the function hits the per-test time limit", async () => {
    const result = await run("def relu(x):\n    while True:\n        pass\n", "run");
    expect(toVerdict(result).verdict).toBe("time_limit_exceeded");
    expect(result.tests.every((t) => t.timedOut)).toBe(true);
  });

  test("an infinite loop at import time is a time limit too", async () => {
    const result = await run(
      "while True:\n    pass\n\ndef relu(x):\n    return x\n",
      "run",
    );
    expect(toVerdict(result).verdict).toBe("time_limit_exceeded");
  });

  test("a banned import is reported without running anything", async () => {
    const result = await run("import torch\n\ndef relu(x):\n    return x\n");
    expect(result.outcome).toBe("import_violation");
    expect(result.violations).toEqual(["torch"]);
    expect(result.tests).toEqual([]);
  });

  test("reaching around the import rules is a violation", async () => {
    const sneaky =
      "def relu(x):\n    __import__('os').system('id')\n    return open('x')\n";
    const result = await run(sneaky);
    expect(result.outcome).toBe("import_violation");
    expect(result.violations).toEqual(["__import__", "open()"]);
  });

  test("standard-library modules on the denylist are violations; others are allowed", async () => {
    expect((await run("import os\n\ndef relu(x):\n    return x\n")).violations).toEqual([
      "os",
    ]);
    const allowed =
      "import math\nimport numpy as np\n\ndef relu(x):\n    return np.maximum(x, math.floor(0.5))\n";
    expect(toVerdict(await run(allowed)).verdict).toBe("passed");
  });

  test("dotted prohibitions catch submodules in imports and attribute chains", async () => {
    const problem = {
      ...reluProblem,
      allowedPackages: ["numpy"],
      prohibitedImports: ["numpy.linalg"],
    };
    const cases = [
      "import numpy.linalg\n\ndef relu(x):\n    return x\n",
      "from numpy.linalg import norm\n\ndef relu(x):\n    return x\n",
      "from numpy import linalg\n\ndef relu(x):\n    return x\n",
      "import numpy as np\n\ndef relu(x):\n    return np.linalg.norm(x)\n",
    ];
    for (const code of cases) {
      expect((await run(code, "run", problem)).violations).toEqual(["numpy.linalg"]);
    }
    const fine = "import numpy as np\n\ndef relu(x):\n    return np.maximum(x, 0)\n";
    expect(toVerdict(await run(fine, "submit", problem)).verdict).toBe("passed");
  });

  test("a syntax error is a runtime error with the location", async () => {
    const result = await run("def relu(x)\n    return x\n");
    expect(toVerdict(result).verdict).toBe("runtime_error");
    expect(result.errorOutput).toContain("SyntaxError");
    expect(result.errorOutput).toContain("line 1");
  });

  test("a missing entry point is a runtime error naming it", async () => {
    const result = await run("def rectify(x):\n    return x\n");
    expect(toVerdict(result).verdict).toBe("runtime_error");
    expect(result.errorOutput).toBe("solution.py does not define `relu`.");
  });

  test("an exception at import time is the learner's runtime error", async () => {
    const result = await run("raise ValueError('bad setup')\n");
    expect(toVerdict(result).verdict).toBe("runtime_error");
    expect(result.errorOutput).toStartWith("ValueError: bad setup");
  });

  test("a broken test file is our internal error, not the learner's", async () => {
    const broken = {
      ...reluProblem,
      testsPublic: "from solution import relu\nimport not_a_module\n",
    };
    const result = await run(reluSolution, "run", broken);
    expect(toVerdict(result).verdict).toBe("internal_error");
  });

  test("helpers are importable when the problem provides them", async () => {
    const withHelpers = {
      ...reluProblem,
      helpers: "import numpy as np\n\n\ndef clip_low(x):\n    return np.maximum(x, 0)\n",
    };
    const code = "from helpers import clip_low\n\ndef relu(x):\n    return clip_low(x)\n";
    expect(toVerdict(await run(code, "submit", withHelpers)).verdict).toBe("passed");
    expect((await run(code)).violations).toEqual(["helpers"]);
  });

  test("inspection parses files without running them", async () => {
    const result = await provider.run(
      buildInspectRequest(reluProblem, "inspect", [
        {
          path: "solution.py",
          content: "import numpy as np\n\ndef relu(x):\n    while True: pass\n",
        },
        { path: "tests/test_public.py", content: reluProblem.testsPublic },
        { path: "starter.py", content: "def relu(x)\n" },
      ]),
    );
    expect(result.outcome).toBe("completed");
    const [solution, tests, starter] = result.inspection?.files ?? [];
    expect(solution).toMatchObject({
      definitions: ["relu"],
      imports: ["numpy"],
      syntaxError: null,
    });
    expect(tests?.testFunctions).toEqual([
      "test_zeroes_negative_values",
      "test_keeps_the_input_shape",
    ]);
    expect(tests?.imports).toEqual(["numpy", "solution"]);
    expect(tests?.asserts.every((a) => a.hasMessage)).toBe(true);
    expect(starter?.syntaxError).toContain("SyntaxError");
  });

  test("a cancelled run reports a harness error and stops", async () => {
    const controller = new AbortController();
    const pending = provider.run(
      buildRunRequest(reluProblem, {
        runId: "cancel",
        code: "def relu(x):\n    while True: pass\n",
        mode: "run",
      }),
      controller.signal,
    );
    setTimeout(() => controller.abort(), 200);
    const result = await pending;
    expect(result.outcome).toBe("harness_error");
    expect(result.errorOutput).toBe("The run was cancelled.");
  });
});

describe.skipIf(!hasTorchEnvironment)("local provider with PyTorch", () => {
  test("a torch problem runs without the address-space limit", async () => {
    const torchProblem: RunnableProblem = {
      ...reluProblem,
      environment: "torch",
      allowedPackages: ["torch"],
      prohibitedImports: ["numpy"],
      timeLimitSeconds: 5,
      testsPublic:
        'import torch\nfrom solution import relu\n\n\ndef test_clips():\n    assert torch.equal(relu(torch.tensor([-1.0, 1.0])), torch.tensor([0.0, 1.0])), "should clip"\n',
      testsHidden: "",
    };
    const code = "import torch\n\n\ndef relu(x):\n    return torch.clamp(x, min=0)\n";
    expect(toVerdict(await run(code, "run", torchProblem)).verdict).toBe("passed");
  });
});

describe("local provider safety", () => {
  test("refuses to run in production", () => {
    expect(() => new LocalProvider({ pythonPath, nodeEnv: "production" })).toThrow(
      /not a security boundary/,
    );
  });

  test("rejects file paths that would overwrite the harness or escape the run directory", async () => {
    for (const path of [
      "harness.py",
      "conftest.py",
      "../evil.py",
      "tests/../../x.py",
      "spec.json",
    ]) {
      const request = buildRunRequest(reluProblem, {
        runId: "x",
        code: reluSolution,
        mode: "run",
      });
      request.files.push({ path, content: "" });
      expect(provider.run(request)).rejects.toThrow(/Invalid run file path/);
    }
  });
});
