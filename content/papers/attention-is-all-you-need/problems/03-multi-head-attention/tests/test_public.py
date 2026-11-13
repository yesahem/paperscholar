import numpy as np
from helpers import scaled_dot_product_attention
from solution import multi_head_attention


def weights(seed, d_model):
    rng = np.random.default_rng(seed)
    return [rng.normal(size=(d_model, d_model)) / np.sqrt(d_model) for _ in range(4)]


def test_one_head_is_plain_attention_with_projections():
    X = np.random.default_rng(10).normal(size=(5, 8))
    W_q, W_k, W_v, W_o = weights(11, 8)
    expected = scaled_dot_product_attention(X @ W_q, X @ W_k, X @ W_v)[0] @ W_o
    result = multi_head_attention(X, W_q, W_k, W_v, W_o, 1)
    assert np.allclose(result, expected), "with one head the result should be attention of the projections, then W_o"


def test_keeps_the_input_shape():
    X = np.random.default_rng(12).normal(size=(7, 12))
    result = multi_head_attention(X, *weights(13, 12), 3)
    assert result.shape == (7, 12), f"expected shape (7, 12), got {result.shape}"
