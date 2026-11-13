# Bias-corrected moment estimates

Adam keeps two running averages for every parameter: $m$, an average of the gradient, and
$v$, an average of the squared gradient. Together they say which way a parameter should move
and how noisy its gradient is.

## The update

At step $t = 1, 2, \dots$, with gradient $g_t$ and decay rates $\beta_1, \beta_2 \in [0, 1)$:

$$
m_t = \beta_1 m_{t-1} + (1 - \beta_1)\, g_t
\qquad
v_t = \beta_2 v_{t-1} + (1 - \beta_2)\, g_t^2
$$

where $g_t^2$ squares each element. Both averages start at zero, $m_0 = v_0 = 0$, so early on
they are pulled towards zero: after the first step $m_1 = (1 - \beta_1) g_1$, only a tenth of
the gradient for $\beta_1 = 0.9$. Adam divides that bias out:

$$
\hat m_t = \frac{m_t}{1 - \beta_1^{\,t}}
\qquad
\hat v_t = \frac{v_t}{1 - \beta_2^{\,t}}
$$

As $t$ grows, $\beta^t$ goes to zero and the correction fades away.

## Your task

Implement `update_moments(m, v, grad, step, beta1, beta2)`.

- `m`, `v`, `grad`: tensors of the same shape. `m` and `v` hold $m_{t-1}$ and $v_{t-1}$.
- `step`: the step number $t$, starting at `1`.
- `beta1`, `beta2`: floats in $[0, 1)$.

Return a tuple `(m_new, v_new, m_hat, v_hat)` of new tensors, the same shape as `grad`. Do
not modify `m`, `v` or `grad`.

Use PyTorch operations. `torch.optim` is not allowed: the point is to build it yourself.

## Example

`m = v = 0`, `grad = [2.0]`, `step = 1`, `beta1 = 0.9`, `beta2 = 0.999`: `m_new = 0.2`,
`v_new = 0.004`, `m_hat = 0.2 / 0.1 = 2.0` and `v_hat = 0.004 / 0.001 = 4.0`. After one step
the corrected estimates are exactly the gradient and its square.

## Common mistakes

- Using $\beta^{t-1}$ or a fixed $\beta$ in the correction instead of $\beta^{t}$.
- Updating `m` and `v` in place with `mul_` or `+=`, which changes the caller's tensors.
- Squaring after averaging instead of averaging the squared gradient.
