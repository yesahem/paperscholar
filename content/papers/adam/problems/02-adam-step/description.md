# Adam step

With the bias-corrected estimates $\hat m_t$ and $\hat v_t$, Adam moves each parameter by

$$
\theta_t = \theta_{t-1} - \alpha \,\frac{\hat m_t}{\sqrt{\hat v_t} + \epsilon}
$$

where $\alpha$ is the step size and $\epsilon$ a small constant that avoids division by zero.
The ratio $\hat m_t / \sqrt{\hat v_t}$ is roughly a signal-to-noise ratio: a parameter whose
gradient points the same way every step moves by about $\alpha$, while one whose gradient
keeps changing sign moves less. Scaling every gradient by a constant leaves the step
unchanged, so $\alpha$ sets the size of updates directly.

## Your task

Implement `adam_step(param, grad, state, lr=1e-3, beta1=0.9, beta2=0.999, eps=1e-8)`.

- `param`, `grad`: tensors of the same shape.
- `state`: a dict `{"step": int, "m": tensor, "v": tensor}` holding the step count so far
  and the running averages. Before the first update it is `{"step": 0, "m": zeros, "v": zeros}`.

Return `(new_param, new_state)`. `new_state` is a new dict with `step` increased by one and
the updated `m` and `v` (not the corrected ones). Do not modify `param`, `grad` or `state`.

The moment update from the previous step is available:
`from helpers import update_moments` gives
`update_moments(m, v, grad, step, beta1, beta2)`, returning `(m_new, v_new, m_hat, v_hat)`.

`torch.optim` is not allowed.

## Example

`param = [1.0]`, `grad = [2.0]`, a fresh state, `lr = 0.1`: the first update has
$\hat m = 2$ and $\hat v = 4$, so the step is $0.1 \cdot 2 / (2 + 10^{-8}) \approx 0.1$ and
`new_param` is approximately `[0.9]`. `new_state["step"]` is `1`.

## Common mistakes

- Adding $\epsilon$ inside the square root.
- Storing the corrected $\hat m$, $\hat v$ in the state instead of $m$, $v$.
- Forgetting to increase the step count, so the bias correction never fades.
