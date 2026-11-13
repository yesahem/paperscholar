import numpy as np
import pytest
from solution import multi_head_attention


def softmax_rows(scores):
    shifted = np.exp(scores - scores.max(axis=-1, keepdims=True))
    return shifted / shifted.sum(axis=-1, keepdims=True)


def reference(X, W_q, W_k, W_v, W_o, h, mask=None):
    d_k = X.shape[1] // h
    Q, K, V = X @ W_q, X @ W_k, X @ W_v
    heads = []
    for j in range(h):
        columns = slice(j * d_k, (j + 1) * d_k)
        scores = Q[:, columns] @ K[:, columns].T / np.sqrt(d_k)
        if mask is not None:
            scores = np.where(mask, scores, -1e30)
        heads.append(softmax_rows(scores) @ V[:, columns])
    return np.concatenate(heads, axis=1) @ W_o


def weights(seed, d_model):
    rng = np.random.default_rng(seed)
    return [rng.normal(size=(d_model, d_model)) / np.sqrt(d_model) for _ in range(4)]


def test_matches_a_head_by_head_reference():
    X = np.random.default_rng(20).normal(size=(6, 16))
    W = weights(21, 16)
    assert np.allclose(multi_head_attention(X, *W, 4), reference(X, *W, 4)), "head j should use columns j*d_k to (j+1)*d_k"


def test_applies_the_mask_to_every_head():
    X = np.random.default_rng(22).normal(size=(5, 8))
    W = weights(23, 8)
    causal = np.tril(np.ones((5, 5), dtype=bool))
    result = multi_head_attention(X, *W, 2, causal)
    assert np.allclose(result, reference(X, *W, 2, causal)), "the mask should apply to every head"


def test_more_heads_change_the_result():
    X = np.random.default_rng(24).normal(size=(4, 8))
    W = weights(25, 8)
    assert not np.allclose(multi_head_attention(X, *W, 1), multi_head_attention(X, *W, 4)), "splitting into heads should change the output"


def test_rejects_a_width_not_divisible_by_the_heads():
    X = np.ones((3, 10))
    with pytest.raises(ValueError):
        multi_head_attention(X, *weights(26, 10), 3)
