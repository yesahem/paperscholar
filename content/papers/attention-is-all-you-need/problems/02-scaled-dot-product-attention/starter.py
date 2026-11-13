import numpy as np


def scaled_dot_product_attention(
    Q: np.ndarray, K: np.ndarray, V: np.ndarray, mask: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """softmax(Q K^T / sqrt(d_k)) V, with optional boolean mask (True = allowed).

    Q: (..., n_q, d_k). K: (..., n_k, d_k). V: (..., n_k, d_v).
    Returns (output of shape (..., n_q, d_v), weights of shape (..., n_q, n_k)).
    """
    raise NotImplementedError
