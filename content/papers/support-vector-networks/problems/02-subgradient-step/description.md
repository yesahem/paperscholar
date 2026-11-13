# Subgradient step

The paper finds the soft-margin hyperplane by solving its dual, a quadratic program. A simpler
way to train the same model, widely used since, is to descend the primal objective directly:

$$
J(w, b) = \frac{1}{2}\lVert w \rVert^2 + C \sum_{i=1}^{n} \max\bigl(0,\; 1 - y_i (w \cdot x_i + b)\bigr)
$$

The hinge has a corner where the margin equals $1$, so $J$ has no gradient there. A
_subgradient_ still points uphill, and stepping against it works as gradient descent does.

## The subgradient

Call point $i$ _active_ when its margin is strictly below one: $y_i (w \cdot x_i + b) < 1$.
Only active points contribute. With $A$ the set of active points:

$$
g_w = w - C \sum_{i \in A} y_i x_i \qquad g_b = -C \sum_{i \in A} y_i
$$

A point with margin exactly $1$ is **not** active: at the corner we pick the zero slope.

## Your task

Implement `subgradient_step(w, b, X, y, C, lr)`, returning the parameters after one step:

$$
w' = w - \text{lr} \cdot g_w \qquad b' = b - \text{lr} \cdot g_b
$$

| Argument | Type                           | Shape    |
| -------- | ------------------------------ | -------- |
| `w`      | float array                    | `(d,)`   |
| `b`      | float                          | scalar   |
| `X`      | float array, one point per row | `(n, d)` |
| `y`      | array of `-1.0` and `+1.0`     | `(n,)`   |
| `C`      | float, non-negative            | scalar   |
| `lr`     | float, positive step size      | scalar   |

Return a tuple `(w_new, b_new)`: a new array of shape `(d,)` and a Python `float`. Do not
modify `w` or any other argument.

## Example

With `w = [0, 0]`, `b = 0`, one point `(1, 2)` labelled `+1`, `C = 1` and `lr = 0.1`: the
margin is $0$, so the point is active, $g_w = (0, 0) - (1, 2) = (-1, -2)$ and $g_b = -1$.
The step gives `w_new = [0.1, 0.2]` and `b_new = 0.1`.

## Common mistakes

- Treating points with margin exactly $1$ as active.
- Dropping the $w$ term from $g_w$: the margin term pulls $w$ towards zero on every step.
- Updating `w` in place, which changes the caller's array.
