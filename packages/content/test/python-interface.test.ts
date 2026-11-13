import { describe, expect, test } from "bun:test";
import { extractPythonInterface } from "../src/python-interface";

describe("extractPythonInterface", () => {
  test("keeps multi-line signatures and drops bodies", () => {
    const source = `import numpy as np


def scaled_dot_product_attention(
    Q: np.ndarray, K: np.ndarray, V: np.ndarray, mask: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray]:
    d_k = Q.shape[-1]
    return Q, K
`;
    expect(extractPythonInterface(source)).toBe(`def scaled_dot_product_attention(
    Q: np.ndarray, K: np.ndarray, V: np.ndarray, mask: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray]:
    ...`);
  });

  test("keeps docstrings, one-line and multi-line", () => {
    const source = `def softmax(x, axis=-1):
    """Softmax along \`axis\`."""
    return x


def relu(x):
    """
    Elementwise max(0, x).

    Keeps the shape.
    """
    secret = 42
    return x
`;
    expect(extractPythonInterface(source)).toBe(`def softmax(x, axis=-1):
    """Softmax along \`axis\`."""
    ...


def relu(x):
    """
    Elementwise max(0, x).

    Keeps the shape.
    """
    ...`);
  });

  test("lists a class with its public methods and skips private names", () => {
    const source = `class Linear:
    """A dense layer."""

    def __init__(self, weight, bias):
        self.weight = weight

    def forward(self, x):
        def helper():
            return 1
        return x @ self.weight

    def _cache(self):
        return None


def _private():
    return "hidden body"
`;
    expect(extractPythonInterface(source)).toBe(`class Linear:
    """A dense layer."""
    def __init__(self, weight, bias):
        ...
    def forward(self, x):
        ...`);
  });

  test("ignores colons inside default values and brackets in strings", () => {
    const source = `def pad(x, mode: str = "a:b(", value=None):
    return {"k": x}
`;
    expect(extractPythonInterface(source)).toBe(
      `def pad(x, mode: str = "a:b(", value=None):\n    ...`,
    );
  });

  test("keeps only the signature of a one-line definition", () => {
    expect(extractPythonInterface("def double(x): return 2 * x  # CANARY\n")).toBe(
      "def double(x):\n    ...",
    );
  });

  test("never contains a body line", () => {
    const source = `def f(x):\n    return "CANARY-BODY"\n`;
    expect(extractPythonInterface(source)).not.toContain("CANARY-BODY");
  });
});
