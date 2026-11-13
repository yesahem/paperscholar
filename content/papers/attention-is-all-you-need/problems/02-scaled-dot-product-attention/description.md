# Scaled dot-product attention

Attention lets every query gather information from a set of key–value pairs. Each query
scores every key, the scores become weights that sum to one, and the output is the weighted
average of the values.

## The operation

With queries $Q$, keys $K$, values $V$ and key width $d_k$:

$$
\mathrm{Attention}(Q, K, V) = \mathrm{softmax}\!\left(\frac{Q K^{\top}}{\sqrt{d_k}}\right) V
$$

The softmax runs along the keys, so each query's weights sum to one. Dividing by
$\sqrt{d_k}$ keeps the scores from growing with the width: without it, large widths push
the softmax towards a single key and its gradients towards zero.

A **mask** says which keys a query may look at. Disallowed keys get weight $0$, which is the
same as setting their score to $-\infty$ before the softmax. The decoder uses this to stop a
position from attending to later positions.

## Your task

Implement `scaled_dot_product_attention(Q, K, V, mask=None)`.

| Argument | Shape                                        | Meaning                                                      |
| -------- | -------------------------------------------- | ------------------------------------------------------------ |
| `Q`      | `(..., n_q, d_k)`                            | queries                                                      |
| `K`      | `(..., n_k, d_k)`                            | keys                                                         |
| `V`      | `(..., n_k, d_v)`                            | values                                                       |
| `mask`   | broadcastable to `(..., n_q, n_k)`, booleans | `True` where attention is allowed. `None` allows everything. |

`...` stands for any leading batch dimensions, the same for all three arrays. Every query is
allowed at least one key.

Return a tuple `(output, weights)`: `output` has shape `(..., n_q, d_v)` and `weights`, the
attention weights, has shape `(..., n_q, n_k)`.

## Example

`Q = [[1, 0]]`, `K = [[1, 0], [0, 1]]`, `V = [[1, 2], [3, 4]]`: the scaled scores are
$1/\sqrt{2} \approx 0.7071$ and $0$, the weights $\approx [0.6698, 0.3302]$, and the output
$\approx [1.6605, 2.6605]$.

## Common mistakes

- Taking the softmax over the queries instead of the keys.
- Computing $e^{x}$ of raw scores: large scores overflow. Subtract each row's maximum first;
  the softmax does not change.
- Scaling by $d_k$ instead of $\sqrt{d_k}$.
- Masking by multiplying weights by zero after the softmax, so the rest no longer sum to one.
