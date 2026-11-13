import numpy as np
from helpers import scaled_dot_product_attention


def multi_head_attention(
    X: np.ndarray,
    W_q: np.ndarray,
    W_k: np.ndarray,
    W_v: np.ndarray,
    W_o: np.ndarray,
    num_heads: int,
    mask: np.ndarray | None = None,
) -> np.ndarray:
    n, d_model = X.shape
    if d_model % num_heads != 0:
        raise ValueError(f"d_model ({d_model}) must be divisible by num_heads ({num_heads})")
    d_k = d_model // num_heads

    def split(projected: np.ndarray) -> np.ndarray:
        return projected.reshape(n, num_heads, d_k).transpose(1, 0, 2)

    heads, _ = scaled_dot_product_attention(split(X @ W_q), split(X @ W_k), split(X @ W_v), mask)
    concatenated = heads.transpose(1, 0, 2).reshape(n, d_model)
    return concatenated @ W_o
