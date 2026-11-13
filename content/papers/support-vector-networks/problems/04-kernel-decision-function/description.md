# Kernel decision function

Training a support-vector network produces one weight $\alpha_i \ge 0$ per training point.
Most weights are zero; the points with $\alpha_i > 0$ are the _support vectors_, and they
alone define the classifier. Written with a kernel $K$, the decision function is

$$
f(x) = \sum_{i=1}^{s} \alpha_i \, y_i \, K(x_i, x) + b
$$

and the predicted class is the sign of $f(x)$. This is where the kernel earns its keep: the
hyperplane lives in the huge feature space, but scoring a point needs only $s$ kernel values.

## Your task

Implement `decision_function(alphas, y, X_support, b, X, degree)`, returning $f$ for every
row of `X`, using the polynomial kernel $K(u, v) = (u \cdot v + 1)^p$.

| Argument    | Type                          | Shape    |
| ----------- | ----------------------------- | -------- |
| `alphas`    | float array, non-negative     | `(s,)`   |
| `y`         | labels of the support vectors | `(s,)`   |
| `X_support` | the support vectors           | `(s, d)` |
| `b`         | float                         | scalar   |
| `X`         | points to score               | `(m, d)` |
| `degree`    | positive integer $p$          | scalar   |

Return a float array of shape `(m,)`.

The kernel from the previous step is available: `from helpers import polynomial_kernel`
gives `polynomial_kernel(X, Z, degree)`, returning the `(n, m)` matrix of
$(X_i \cdot Z_j + 1)^p$.

## Example

`alphas = [0.5, 0.5]`, `y = [1, -1]`, support vectors `(1, 0)` and `(0, 1)`, `b = 0`,
`degree = 1`, and one point `(1, 0)`: the kernel values are $2$ and $1$, so
$f = 0.5 \cdot 2 - 0.5 \cdot 1 = 0.5$.

## Common mistakes

- Multiplying by $\alpha_i$ but not by the label $y_i$.
- Putting the support vectors and the new points the wrong way round, which gives a
  transposed kernel matrix.
- Forgetting the bias $b$.
