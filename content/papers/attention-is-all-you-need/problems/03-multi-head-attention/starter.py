import numpy as np


def multi_head_attention(
    X: np.ndarray,
    W_q: np.ndarray,
    W_k: np.ndarray,
    W_v: np.ndarray,
    W_o: np.ndarray,
    num_heads: int,
    mask: np.ndarray | None = None,
) -> np.ndarray:
    """Self-attention with num_heads heads. X: (n, d_model); every W: (d_model, d_model).

    Head j uses columns j * d_k to (j + 1) * d_k of the projections, d_k = d_model // num_heads.
    `from helpers import scaled_dot_product_attention` is available.
    Returns (n, d_model). Raises ValueError when d_model % num_heads != 0.
    """
    raise NotImplementedError
