# Polynomial kernel

A linear classifier draws straight boundaries. Support-vector networks get curved ones by
mapping every input into a much larger feature space and separating there. The mapping is
never computed: the classifier only ever needs dot products between mapped points, and a
_kernel_ $K(u, v)$ returns that dot product directly from the original inputs.

The paper's experiments use the polynomial kernel

$$
K(u, v) = (u \cdot v + 1)^p
$$

which equals a dot product in the space of all monomials of the inputs up to degree $p$.
For $p = 2$ in two dimensions that space has six coordinates; for 256-pixel images and
$p = 7$ it is astronomically large, yet $K$ costs one dot product.

## Your task

Implement `polynomial_kernel(X, Z, degree)`, the kernel between every row of `X` and every
row of `Z`:

$$
K_{ij} = (X_i \cdot Z_j + 1)^{p}
$$

| Argument | Type                 | Shape    |
| -------- | -------------------- | -------- |
| `X`      | float array          | `(n, d)` |
| `Z`      | float array          | `(m, d)` |
| `degree` | positive integer $p$ | scalar   |

Return a float array of shape `(n, m)`.

## Example

`X = [[1, 2]]`, `Z = [[3, 4], [0, 0]]`, `degree = 2`: the dot products are $11$ and $0$, so
the result is `[[144, 1]]`.

## Common mistakes

- Leaving out the $+1$. Without it, degree $p$ keeps only the monomials of exactly degree $p$.
- Computing `X @ Z` instead of `X @ Z.T`: rows of `Z` are points.
- Looping over pairs in Python. One matrix product does all of them.
