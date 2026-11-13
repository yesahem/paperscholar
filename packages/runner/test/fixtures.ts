import { defaultLocalPythonPath, type RunnableProblem } from "../src";

/** A tiny NumPy problem used to exercise the harness end to end. */
export const reluProblem: RunnableProblem = {
  entryPoint: "relu",
  environment: "numpy",
  allowedPackages: ["numpy"],
  prohibitedImports: ["torch", "jax"],
  timeLimitSeconds: 1,
  memoryLimitMb: 256,
  testsPublic: `import numpy as np
from solution import relu


def test_zeroes_negative_values():
    print("checking negative values")
    out = relu(np.array([-1.0, 2.0]))
    assert np.array_equal(out, np.array([0.0, 2.0])), "negative values should become 0"


def test_keeps_the_input_shape():
    assert relu(np.zeros((2, 3))).shape == (2, 3), "output should keep the input shape"
`,
  testsHidden: `import numpy as np
from solution import relu


def test_handles_integer_ranges():
    x = np.arange(-5, 5)
    assert np.array_equal(relu(x), np.maximum(x, 0)), "integer inputs should be clipped at 0"


def test_leaves_positive_values_unchanged():
    x = np.array([0.5, 3.0])
    assert np.array_equal(relu(x), x), "positive values should be unchanged"
`,
  helpers: null,
};

export const reluSolution = `import numpy as np


def relu(x):
    return np.maximum(x, 0)
`;

export const reluStarter = `def relu(x):
    raise NotImplementedError
`;

/** Python for the harness tests: RUNNER_PYTHON, else the runner:setup venv, else python3. */
export const pythonPath = process.env.RUNNER_PYTHON || defaultLocalPythonPath();

function canImport(modules: string): boolean {
  try {
    return Bun.spawnSync([pythonPath, "-c", `import ${modules}`]).exitCode === 0;
  } catch {
    return false;
  }
}

export const hasNumpyEnvironment = canImport("numpy, pytest");
export const hasTorchEnvironment = canImport("torch, pytest");

// In CI the environment must exist; a silent skip would hide a broken runner.
if (process.env.CI && !hasNumpyEnvironment) {
  throw new Error(
    `CI: ${pythonPath} lacks numpy and pytest. Run \`bun run runner:setup\`.`,
  );
}
