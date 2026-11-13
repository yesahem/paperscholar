# Multi-head attention

A single attention function produces one weighted average per query, so it can follow only
one kind of relationship at a time. Multi-head attention runs $h$ attention functions in
parallel, each on its own learned projection of the input, and combines their results. One
head can track syntax while another tracks coreference.

## The operation

For self-attention on a sequence $X$ of shape $(n, d_{model})$ with $h$ heads of width
$d_k = d_{model} / h$:

1. Project: $Q = X W^Q$, $K = X W^K$, $V = X W^V$, each of shape $(n, d_{model})$.
2. Split: head $j$ takes columns $j \cdot d_k$ to $(j + 1) \cdot d_k - 1$ of $Q$, $K$ and $V$.
3. Attend: $\text{head}_j = \mathrm{Attention}(Q_j, K_j, V_j)$, each of shape $(n, d_k)$.
4. Concatenate the heads in order, back to $(n, d_{model})$, and project:

$$
\mathrm{MultiHead}(X) = \mathrm{Concat}(\text{head}_1, \dots, \text{head}_h)\, W^O
$$

Splitting one big projection into column blocks is the same as giving each head its own
$d_{model} \times d_k$ projection, which is how the paper writes it.

## Your task

Implement `multi_head_attention(X, W_q, W_k, W_v, W_o, num_heads, mask=None)`.

| Argument                   | Shape                                                           |
| -------------------------- | --------------------------------------------------------------- |
| `X`                        | `(n, d_model)`                                                  |
| `W_q`, `W_k`, `W_v`, `W_o` | `(d_model, d_model)`                                            |
| `num_heads`                | positive integer $h$                                            |
| `mask`                     | `(n, n)` booleans, `True` where attention is allowed, or `None` |

Return an array of shape `(n, d_model)`. Raise `ValueError` if `d_model` is not divisible
by `num_heads`. The same mask applies to every head.

Attention from the previous step is available: `from helpers import scaled_dot_product_attention`
gives `scaled_dot_product_attention(Q, K, V, mask=None)`, which accepts leading batch
dimensions and returns `(output, weights)`.

## Example

With one head, the result is `scaled_dot_product_attention(X @ W_q, X @ W_k, X @ W_v)[0] @ W_o`.

## Common mistakes

- Splitting the rows (positions) instead of the columns (features).
- Reshaping `(n, d_model)` straight to `(h, n, d_k)`. That mixes positions into heads.
  Reshape to `(n, h, d_k)` first, then move the head axis to the front.
- Concatenating the heads in a different order from the split.
