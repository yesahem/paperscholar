import type { RunnableProblem } from "./build-request";

/**
 * A tiny NumPy problem for tests and for the adversarial suite, exported as
 * `@repo/runner/testing`. Not used by application code.
 */
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
