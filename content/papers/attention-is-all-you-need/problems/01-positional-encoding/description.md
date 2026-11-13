# Positional encoding

Attention compares every token with every other token, but it treats its input as a set:
shuffle the tokens and each one's output is unchanged. To use word order, the Transformer
adds a _positional encoding_ to each token embedding, a vector that depends only on the
token's position.

## The encoding

For position $pos$ and dimension index $i$, with model width $d_{model}$:

$$
PE_{(pos,\, 2i)} = \sin\!\left(\frac{pos}{10000^{2i / d_{model}}}\right)
\qquad
PE_{(pos,\, 2i+1)} = \cos\!\left(\frac{pos}{10000^{2i / d_{model}}}\right)
$$

Even columns hold sines, odd columns cosines, and columns $2i$ and $2i+1$ share one
frequency. Frequencies fall geometrically from $1$ to $1/10000$ across the columns, so nearby
positions differ in the fast columns and distant ones in the slow columns.

## Your task

Implement `positional_encoding(seq_len, d_model)`.

- `seq_len`: number of positions, $pos = 0, 1, \dots, \text{seq\_len} - 1$. At least $1$.
- `d_model`: model width. A positive even integer.

Return a float array of shape `(seq_len, d_model)` whose row `pos` is the encoding of
position `pos`.

## Example

Position $0$ is `[0, 1, 0, 1, ...]` because $\sin 0 = 0$ and $\cos 0 = 1$. With
$d_{model} = 4$, position $1$ is approximately `[0.8415, 0.5403, 0.0100, 0.99995]`: the
first pair uses frequency $1$, the second $1/10000^{2/4} = 0.01$.

## Common mistakes

- Using $i$ instead of $2i$ in the exponent. Column $j$ uses exponent $2\lfloor j/2 \rfloor / d_{model}$.
- Giving each column its own frequency instead of sharing one per sine and cosine pair.
- Starting positions at $1$ instead of $0$.
