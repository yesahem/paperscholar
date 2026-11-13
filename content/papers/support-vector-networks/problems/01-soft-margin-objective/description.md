# Soft-margin objective

A support-vector network separates two classes with a hyperplane $w \cdot x + b = 0$ and
prefers the hyperplane with the widest margin. Real data is rarely separable, so the
soft-margin formulation lets some points break the margin and charges for each one.

## The objective

For training points $x_1, \dots, x_n \in \mathbb{R}^d$ with labels $y_i \in \{-1, +1\}$,
the soft-margin classifier minimises

$$
J(w, b) = \frac{1}{2}\lVert w \rVert^2 + C \sum_{i=1}^{n} \max\bigl(0,\; 1 - y_i (w \cdot x_i + b)\bigr)
$$

- $\frac{1}{2}\lVert w \rVert^2$ rewards a wide margin: the band between the two classes has
  width $2 / \lVert w \rVert$.
- $y_i (w \cdot x_i + b)$ is the _functional margin_ of point $i$. It is at least $1$ when the
  point is on the correct side and outside the band.
- $\max(0, 1 - \text{margin})$ is the _hinge_ penalty: zero for those points, growing linearly
  for points inside the band or on the wrong side.
- $C \ge 0$ trades margin width against violations.

The paper writes the penalty with slack variables $\xi_i \ge 0$ and constraints
$y_i (w \cdot x_i + b) \ge 1 - \xi_i$. At the optimum each $\xi_i$ equals the hinge term, so
the two forms describe the same problem.

## Your task

Implement `soft_margin_objective(w, b, X, y, C)`.

| Argument | Type                           | Shape    |
| -------- | ------------------------------ | -------- |
| `w`      | float array                    | `(d,)`   |
| `b`      | float                          | scalar   |
| `X`      | float array, one point per row | `(n, d)` |
| `y`      | array of `-1.0` and `+1.0`     | `(n,)`   |
| `C`      | float, non-negative            | scalar   |

Return $J(w, b)$ as a Python `float`.

## Example

With `w = [1, 0]`, `b = 0`, `C = 1`, and the points `(2, 0)` and `(0.5, 0)`, both labelled
`+1`: the margins are $2$ and $0.5$, so the hinge terms are $0$ and $0.5$, and
$J = \frac{1}{2} \cdot 1 + 0.5 = 1.0$.

## Common mistakes

- Summing $1 - y_i (w \cdot x_i + b)$ without clipping at zero. Points far on the correct
  side must add nothing, not a negative amount.
- Forgetting the $\frac{1}{2}$, or using $\lVert w \rVert$ instead of its square.
- Adding the bias after multiplying by the label instead of before.
- Returning a NumPy array instead of a scalar.
