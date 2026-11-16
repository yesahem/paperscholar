import type { Outline, Plan, StepFiles, WriteAnswer } from "../schemas";
import type { ScriptedAnswer } from "./fake";
import type { LlmPurpose } from "./types";

/**
 * A small, complete paper the fake model "writes": four NumPy steps building
 * a linear classifier's loss. Every file is real and passes verification, so
 * the whole pipeline can be run, demonstrated and tested without a model.
 */

export const DEMO_OUTLINE: Outline = {
  title: "Linear Classifiers from Scratch",
  authors: ["PaperScholar demo"],
  year: 2026,
  url: null,
  summary:
    "A demonstration paper used when no model is configured: the activations, probabilities and loss behind a linear classifier.",
  tags: ["fundamentals", "classical-ml"],
  chunks: [
    {
      id: "c01",
      heading: "1 Rectified linear units",
      pageStart: 1,
      pageEnd: 1,
      summary: "Defines the rectifier as an element-wise maximum with zero.",
      equations: [
        { label: "Eq. 1", latex: "\\max(0, x)", meaning: "the rectifier of x" },
      ],
      algorithms: [],
      implementable: true,
    },
    {
      id: "c02",
      heading: "2 Softmax",
      pageStart: 1,
      pageEnd: 2,
      summary: "Turns a vector of scores into probabilities that sum to one.",
      equations: [
        {
          label: "Eq. 2",
          latex: "\\frac{e^{z_i}}{\\sum_j e^{z_j}}",
          meaning: "the probability of class i given scores z",
        },
      ],
      algorithms: [],
      implementable: true,
    },
    {
      id: "c03",
      heading: "3 Cross-entropy",
      pageStart: 2,
      pageEnd: 2,
      summary:
        "Scores probabilities against the true labels with the mean negative log-likelihood.",
      equations: [
        {
          label: "Eq. 3",
          latex: "-\\frac{1}{n}\\sum_i \\log p_{i, y_i}",
          meaning: "the mean negative log-probability of the true classes",
        },
      ],
      algorithms: [],
      implementable: true,
    },
    {
      id: "c04",
      heading: "4 A linear classifier",
      pageStart: 3,
      pageEnd: 3,
      summary: "Computes scores as XW + b and trains them by minimising cross-entropy.",
      equations: [
        { label: "Eq. 4", latex: "XW + b", meaning: "the class scores of each row of X" },
      ],
      algorithms: [],
      implementable: true,
    },
  ],
  suitability: {
    ok: true,
    reason: "Learners build a linear classifier's loss from its parts.",
  },
};

const numpyStep = {
  environment: "numpy" as const,
  allowedPackages: ["numpy"],
  prohibitedImports: ["torch"],
};

export const DEMO_PLAN: Plan = {
  steps: [
    {
      id: "relu",
      title: "Rectified linear unit",
      summary: "Clip negative values to zero, element by element.",
      concept: "An element-wise non-linearity.",
      chunkIds: ["c01"],
      paperRefs: ["Eq. 1"],
      type: "micro",
      difficulty: "easy",
      entryPoint: "relu",
      signature: "def relu(x: np.ndarray) -> np.ndarray:",
      dependsOn: [],
      ...numpyStep,
    },
    {
      id: "softmax",
      title: "Softmax",
      summary: "Turn scores into probabilities along an axis, stably.",
      concept: "Normalising exponentials, and why to subtract the maximum first.",
      chunkIds: ["c02"],
      paperRefs: ["Eq. 2"],
      type: "micro",
      difficulty: "easy",
      entryPoint: "softmax",
      signature: "def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:",
      dependsOn: [],
      ...numpyStep,
    },
    {
      id: "cross-entropy",
      title: "Cross-entropy",
      summary: "Average the negative log-probability of each row's true class.",
      concept: "The loss that rewards confident, correct probabilities.",
      chunkIds: ["c03"],
      paperRefs: ["Eq. 3"],
      type: "micro",
      difficulty: "medium",
      entryPoint: "cross_entropy",
      signature: "def cross_entropy(logits: np.ndarray, labels: np.ndarray) -> float:",
      dependsOn: ["softmax"],
      ...numpyStep,
    },
    {
      id: "linear-classifier-loss",
      title: "Linear classifier loss",
      summary: "Score inputs with XW + b and return their cross-entropy.",
      concept: "Assembling scores, probabilities and loss into one model.",
      chunkIds: ["c04"],
      paperRefs: ["Eq. 4", "§4"],
      type: "model",
      difficulty: "medium",
      entryPoint: "linear_classifier_loss",
      signature:
        "def linear_classifier_loss(x: np.ndarray, w: np.ndarray, b: np.ndarray, labels: np.ndarray) -> float:",
      dependsOn: ["softmax", "cross-entropy"],
      ...numpyStep,
    },
  ],
  omitted: [
    { what: "Gradient descent", why: "Training is outside a short, deterministic step." },
  ],
};

const SOFTMAX_SOURCE = `def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    """Probabilities along \`axis\`: exponentials of x, normalised to sum to one."""
    shifted = x - np.max(x, axis=axis, keepdims=True)
    exponentials = np.exp(shifted)
    return exponentials / np.sum(exponentials, axis=axis, keepdims=True)
`;

const CROSS_ENTROPY_SOURCE = `def cross_entropy(logits: np.ndarray, labels: np.ndarray) -> float:
    """Mean negative log-probability of each row's true class."""
    probabilities = softmax(logits, axis=-1)
    rows = np.arange(logits.shape[0])
    return float(-np.mean(np.log(probabilities[rows, labels])))
`;

export const DEMO_FILES: Record<string, StepFiles> = {
  relu: {
    description: `# Rectified linear unit

The rectifier keeps positive values and replaces negative ones with zero (Eq. 1):

$$\\operatorname{relu}(x) = \\max(0, x)$$

## Your task

Implement \`relu(x)\` for a NumPy array \`x\` of any shape. Return a new array of the same
shape and dtype; do not modify \`x\`.

## Example

\`relu(np.array([-1.0, 2.0]))\` returns \`array([0., 2.])\`.

## Common mistakes

- Returning a Python list instead of an array.
- Clipping positive values too, as with \`np.clip(x, 0, 0)\`.
`,
    tutorial: `A network made only of matrix products is still a single linear map. Placing a cheap
non-linearity such as the rectifier between them lets the layers express far more.
`,
    starter: `import numpy as np


def relu(x: np.ndarray) -> np.ndarray:
    """Return max(0, x) element-wise, with the shape of x."""
    raise NotImplementedError
`,
    solution: `import numpy as np


def relu(x: np.ndarray) -> np.ndarray:
    """Return max(0, x) element-wise, with the shape of x."""
    return np.maximum(x, 0)
`,
    testsPublic: `import numpy as np
from solution import relu


def test_negative_values_become_zero():
    out = relu(np.array([-1.0, 2.0]))
    assert np.array_equal(out, np.array([0.0, 2.0])), "negative values should become 0"


def test_the_shape_is_kept():
    assert relu(np.zeros((2, 3))).shape == (2, 3), "the output should have the input's shape"
`,
    testsHidden: `import numpy as np
from solution import relu


def test_integer_arrays_are_clipped_at_zero():
    x = np.arange(-3, 3)
    assert np.array_equal(relu(x), np.array([0, 0, 0, 0, 1, 2])), "integers below zero should become 0"


def test_positive_values_are_unchanged():
    x = np.array([0.5, 3.0])
    assert np.array_equal(relu(x), x), "positive values should be unchanged"


def test_the_input_is_not_modified():
    x = np.array([-2.0, 1.0])
    relu(x)
    assert x[0] == -2.0, "relu must not modify its input"
`,
    helpers: null,
  },
  softmax: {
    description: `# Softmax

Softmax turns scores $z$ into probabilities (Eq. 2):

$$p_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}$$

Every $p_i$ is positive and they sum to one. Large scores overflow \`np.exp\`, so subtract
the maximum score first: the result is the same, because the factor $e^{-\\max z}$ cancels.

## Your task

Implement \`softmax(x, axis=-1)\`: the softmax of \`x\` along \`axis\`, an array of the same
shape as \`x\`. Every slice along \`axis\` sums to one.

## Example

\`softmax(np.array([0.0, np.log(2.0)]))\` returns \`array([1/3, 2/3])\`.

## Common mistakes

- Normalising over the whole array instead of along \`axis\`.
- Forgetting to subtract the maximum, which gives \`nan\` for large scores.
`,
    tutorial: `Softmax is the standard way to read a vector of unbounded scores as a probability
distribution over classes. The largest score gets the largest share, smoothly.
`,
    starter: `import numpy as np


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    """Probabilities along \`axis\`: exponentials of x, normalised to sum to one."""
    raise NotImplementedError
`,
    solution: `import numpy as np


${SOFTMAX_SOURCE}`,
    testsPublic: `import numpy as np
from solution import softmax


def test_matches_the_worked_example():
    out = softmax(np.array([0.0, np.log(2.0)]))
    assert np.allclose(out, [1 / 3, 2 / 3]), "softmax([0, ln 2]) should be [1/3, 2/3]"


def test_each_row_sums_to_one():
    x = np.random.default_rng(0).normal(size=(4, 5))
    assert np.allclose(softmax(x).sum(axis=-1), 1.0), "each row should sum to 1"
`,
    testsHidden: `import numpy as np
from solution import softmax


def test_large_scores_do_not_overflow():
    out = softmax(np.array([1000.0, 1000.0]))
    assert np.allclose(out, [0.5, 0.5]), "equal large scores should give equal probabilities"


def test_the_axis_argument_is_respected():
    x = np.random.default_rng(1).normal(size=(3, 4))
    assert np.allclose(softmax(x, axis=0).sum(axis=0), 1.0), "with axis=0 each column should sum to 1"


def test_adding_a_constant_changes_nothing():
    x = np.array([[1.0, 2.0, 3.0]])
    assert np.allclose(softmax(x), softmax(x + 5.0)), "softmax should not change when every score shifts"
`,
    helpers: null,
  },
  "cross-entropy": {
    description: `# Cross-entropy

Given scores (logits) for $n$ examples and their true classes $y_i$, cross-entropy is the
mean negative log-probability of the true classes (Eq. 3):

$$L = -\\frac{1}{n}\\sum_{i=1}^{n} \\log p_{i, y_i}, \\qquad p_i = \\operatorname{softmax}(z_i)$$

## Your task

Implement \`cross_entropy(logits, labels)\`.

- \`logits\`: a float array of shape \`(n, k)\`, one row of class scores per example.
- \`labels\`: an integer array of shape \`(n,)\` with values in \`0 … k-1\`.

Return $L$ as a Python \`float\`.

## Helpers

\`from helpers import softmax\` gives \`softmax(x, axis=-1)\` from the previous step.

## Example

With \`logits = [[0, 0]]\` and \`labels = [1]\`, both classes have probability $1/2$, so
$L = \\ln 2 \\approx 0.693$.

## Common mistakes

- Summing instead of averaging over examples.
- Taking the probability of the wrong class, or of every class.
`,
    tutorial: `Cross-entropy punishes a confident wrong answer far more than an unsure one, which is
what makes it a good training signal for classifiers.
`,
    starter: `import numpy as np


def cross_entropy(logits: np.ndarray, labels: np.ndarray) -> float:
    """Mean negative log-probability of each row's true class."""
    raise NotImplementedError
`,
    solution: `import numpy as np
from helpers import softmax


${CROSS_ENTROPY_SOURCE}`,
    testsPublic: `import numpy as np
from solution import cross_entropy


def test_two_equal_scores_cost_ln_two():
    loss = cross_entropy(np.array([[0.0, 0.0]]), np.array([1]))
    assert np.isclose(loss, np.log(2.0)), f"expected ln 2 for two equal scores, got {loss}"


def test_a_confident_correct_answer_costs_almost_nothing():
    loss = cross_entropy(np.array([[10.0, -10.0]]), np.array([0]))
    assert loss < 1e-6, "a confident correct answer should cost almost nothing"
`,
    testsHidden: `import numpy as np
from solution import cross_entropy


def test_the_result_is_a_float():
    loss = cross_entropy(np.array([[1.0, 2.0]]), np.array([0]))
    assert isinstance(loss, float), "cross_entropy should return a Python float"


def test_examples_are_averaged_not_summed():
    loss = cross_entropy(np.array([[0.0, 0.0], [10.0, -10.0]]), np.array([0, 0]))
    assert np.isclose(loss, np.log(2.0) / 2, atol=1e-6), "the loss should be the mean over examples"


def test_the_true_class_is_the_one_scored():
    wrong = cross_entropy(np.array([[10.0, -10.0]]), np.array([1]))
    assert wrong > 10.0, "a confident wrong answer should cost a lot"
`,
    helpers: `import numpy as np


${SOFTMAX_SOURCE}`,
  },
  "linear-classifier-loss": {
    description: `# Linear classifier loss

A linear classifier scores each example $x$ with $z = xW + b$ (Eq. 4) and is trained to
minimise the cross-entropy of those scores.

## Your task

Implement \`linear_classifier_loss(x, w, b, labels)\`.

- \`x\`: shape \`(n, d)\`, one example per row.
- \`w\`: shape \`(d, k)\`; \`b\`: shape \`(k,)\`.
- \`labels\`: integers of shape \`(n,)\`.

Return the cross-entropy of the scores \`x @ w + b\` as a Python \`float\`.

## Helpers

\`from helpers import softmax, cross_entropy\` gives both earlier steps.

## Example

With all-zero \`w\` and \`b\` and $k$ classes, every class has probability $1/k$, so the
loss is $\\ln k$ whatever \`x\` is.

## Common mistakes

- Computing \`w @ x\`, which has the wrong shape.
- Forgetting the bias.
`,
    tutorial: `This is the whole forward pass of multinomial logistic regression: a linear map
followed by softmax and cross-entropy. Training adjusts W and b to lower this number.
`,
    starter: `import numpy as np


def linear_classifier_loss(x: np.ndarray, w: np.ndarray, b: np.ndarray, labels: np.ndarray) -> float:
    """Cross-entropy of the scores x @ w + b against labels."""
    raise NotImplementedError
`,
    solution: `import numpy as np
from helpers import cross_entropy


def linear_classifier_loss(x: np.ndarray, w: np.ndarray, b: np.ndarray, labels: np.ndarray) -> float:
    """Cross-entropy of the scores x @ w + b against labels."""
    return cross_entropy(x @ w + b, labels)
`,
    testsPublic: `import numpy as np
from solution import linear_classifier_loss


def test_zero_weights_cost_ln_k():
    x = np.random.default_rng(0).normal(size=(5, 3))
    loss = linear_classifier_loss(x, np.zeros((3, 4)), np.zeros(4), np.array([0, 1, 2, 3, 0]))
    assert np.isclose(loss, np.log(4.0)), f"with zero weights and 4 classes expected ln 4, got {loss}"


def test_a_bias_towards_the_true_class_lowers_the_loss():
    x = np.zeros((2, 2))
    labels = np.array([1, 1])
    flat = linear_classifier_loss(x, np.zeros((2, 2)), np.zeros(2), labels)
    biased = linear_classifier_loss(x, np.zeros((2, 2)), np.array([0.0, 3.0]), labels)
    assert biased < flat, "a bias towards the true class should lower the loss"
`,
    testsHidden: `import numpy as np
from solution import linear_classifier_loss


def test_the_bias_is_added_to_every_row():
    x = np.zeros((3, 2))
    loss = linear_classifier_loss(x, np.zeros((2, 2)), np.array([0.0, np.log(3.0)]), np.array([1, 1, 1]))
    assert np.isclose(loss, -np.log(0.75)), "the bias should shift every example's scores"


def test_the_weights_multiply_from_the_right():
    x = np.array([[1.0, 0.0, 0.0]])
    w = np.zeros((3, 2))
    w[0, 1] = 20.0
    loss = linear_classifier_loss(x, w, np.zeros(2), np.array([1]))
    assert loss < 1e-6, "scores should be x @ w, so this example strongly favours class 1"


def test_the_result_is_a_float():
    loss = linear_classifier_loss(np.ones((1, 1)), np.ones((1, 2)), np.zeros(2), np.array([0]))
    assert isinstance(loss, float), "the loss should be a Python float"
`,
    helpers: `import numpy as np


${SOFTMAX_SOURCE}

${CROSS_ENTROPY_SOURCE}`,
  },
};

const mutant = (description: string, body: string, imports = "import numpy as np") => ({
  description,
  code: `${imports}\n\n\n${body}\n`,
});
const withCrossEntropy = "import numpy as np\nfrom helpers import cross_entropy";
const withSoftmax = "import numpy as np\nfrom helpers import softmax";

/**
 * V7's mutants for each demo step: real wrong implementations the demo tests
 * catch, and one (in softmax) that is equivalent to the reference.
 */
export const DEMO_MUTANTS: Record<string, { description: string; code: string }[]> = {
  relu: [
    mutant("returns x unchanged", "def relu(x):\n    return x"),
    mutant(
      "clips positive values instead of negative ones",
      "def relu(x):\n    return np.minimum(x, 0)",
    ),
    mutant("takes the absolute value", "def relu(x):\n    return np.abs(x)"),
    mutant("modifies the input in place", "def relu(x):\n    x[x < 0] = 0\n    return x"),
    mutant("returns a list", "def relu(x):\n    return list(np.maximum(x, 0))"),
  ],
  softmax: [
    mutant(
      "normalises over the whole array instead of along the axis",
      "def softmax(x, axis=-1):\n    e = np.exp(x - np.max(x))\n    return e / e.sum()",
    ),
    mutant(
      "does not subtract the maximum, so large scores overflow",
      "def softmax(x, axis=-1):\n    e = np.exp(x)\n    return e / np.sum(e, axis=axis, keepdims=True)",
    ),
    mutant(
      "ignores the axis argument",
      "def softmax(x, axis=-1):\n    e = np.exp(x - np.max(x, axis=-1, keepdims=True))\n    return e / np.sum(e, axis=-1, keepdims=True)",
    ),
    mutant(
      "returns the exponentials without normalising",
      "def softmax(x, axis=-1):\n    return np.exp(x - np.max(x, axis=axis, keepdims=True))",
    ),
    mutant(
      "subtracts the global maximum instead of each slice's",
      "def softmax(x, axis=-1):\n    e = np.exp(x - np.max(x))\n    return e / np.sum(e, axis=axis, keepdims=True)",
    ),
  ],
  "cross-entropy": [
    mutant(
      "sums over examples instead of averaging",
      "def cross_entropy(logits, labels):\n    p = softmax(logits, axis=-1)\n    return float(-np.sum(np.log(p[np.arange(logits.shape[0]), labels])))",
      withSoftmax,
    ),
    mutant(
      "always scores the first class",
      "def cross_entropy(logits, labels):\n    p = softmax(logits, axis=-1)\n    return float(-np.mean(np.log(p[:, 0])))",
      withSoftmax,
    ),
    mutant(
      "returns the loss of each example instead of their mean",
      "def cross_entropy(logits, labels):\n    p = softmax(logits, axis=-1)\n    return -np.log(p[np.arange(logits.shape[0]), labels])",
      withSoftmax,
    ),
    mutant(
      "takes the log of the scores instead of the probabilities",
      "def cross_entropy(logits, labels):\n    return float(-np.mean(logits[np.arange(logits.shape[0]), labels]))",
      withSoftmax,
    ),
    mutant(
      "is off by one in the label index",
      "def cross_entropy(logits, labels):\n    p = softmax(logits, axis=-1)\n    return float(-np.mean(np.log(p[np.arange(logits.shape[0]), labels - 1])))",
      withSoftmax,
    ),
  ],
  "linear-classifier-loss": [
    mutant(
      "multiplies w @ x",
      "def linear_classifier_loss(x, w, b, labels):\n    return cross_entropy(w @ x + b, labels)",
      withCrossEntropy,
    ),
    mutant(
      "forgets the bias",
      "def linear_classifier_loss(x, w, b, labels):\n    return cross_entropy(x @ w, labels)",
      withCrossEntropy,
    ),
    mutant(
      "subtracts the bias",
      "def linear_classifier_loss(x, w, b, labels):\n    return cross_entropy(x @ w - b, labels)",
      withCrossEntropy,
    ),
    mutant(
      "doubles the loss",
      "def linear_classifier_loss(x, w, b, labels):\n    return 2 * cross_entropy(x @ w + b, labels)",
      withCrossEntropy,
    ),
    mutant(
      "transposes the scores",
      "def linear_classifier_loss(x, w, b, labels):\n    return cross_entropy((x @ w).T + b, labels)",
      withCrossEntropy,
    ),
  ],
};

/** The fake model's answers for the demo paper, by purpose. */
export function demoPaperAnswers(
  overrides: Partial<Record<LlmPurpose, ScriptedAnswer>> = {},
): Partial<Record<LlmPurpose, ScriptedAnswer>> {
  return {
    read: () => DEMO_OUTLINE,
    plan: () => DEMO_PLAN,
    write: (request) => {
      const files = request.subject === null ? undefined : DEMO_FILES[request.subject];
      if (!files) throw new Error(`the demo paper has no step ${request.subject}`);
      const answer: WriteAnswer = { files, notes: "Demo files." };
      return answer;
    },
    mutants: (request) => ({ mutants: DEMO_MUTANTS[request.subject ?? ""] ?? [] }),
    // Only a mutant that subtracts a different constant is equivalent.
    equivalence: (request) => ({
      judgements: [...request.prompt.matchAll(/Mutant (\d+): ([^\n]*)/g)].map(
        (match) => ({
          index: Number(match[1]),
          equivalent: (match[2] ?? "").includes("global maximum"),
          reason: (match[2] ?? "").includes("global maximum")
            ? "the subtracted constant cancels in the division"
            : "it gives different results",
        }),
      ),
    }),
    // A careful reader of each demo description writes the reference solution.
    solve: (request) => ({ solution: DEMO_FILES[request.subject ?? ""]?.solution ?? "" }),
    fidelity: (request) => ({
      issues:
        request.subject === "linear-classifier-loss"
          ? [
              {
                severity: "note",
                paperRef: "§4",
                summary:
                  "The paper also trains the classifier; the step stops at the loss.",
              },
            ]
          : [],
    }),
    ...overrides,
  };
}

/**
 * A one-page PDF to feed the demo paper through intake, for tests (the fake
 * model writes the demo paper for any PDF). `seed` changes its bytes, and so
 * its hash, so several demo ingestions can exist at once.
 */
export function demoPdf(seed = "demo"): Uint8Array {
  const text = `Linear Classifiers from Scratch (${seed.replace(/[()\\]/g, "")})`;
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
