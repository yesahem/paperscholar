import numpy as np
from solution import scaled_dot_product_attention


def reference(Q, K, V, mask=None):
    scores = np.einsum("...qd,...kd->...qk", Q, K) / np.sqrt(Q.shape[-1])
    if mask is not None:
        scores = np.where(mask, scores, -1e30)
    weights = np.exp(scores - scores.max(axis=-1, keepdims=True))
    weights /= weights.sum(axis=-1, keepdims=True)
    return np.einsum("...qk,...kv->...qv", weights, V), weights


def test_handles_leading_batch_dimensions():
    rng = np.random.default_rng(1)
    Q, K, V = rng.normal(size=(2, 3, 4, 8)), rng.normal(size=(2, 3, 5, 8)), rng.normal(size=(2, 3, 5, 6))
    output, weights = scaled_dot_product_attention(Q, K, V)
    expected_output, expected_weights = reference(Q, K, V)
    assert output.shape == (2, 3, 4, 6), "the output should keep the batch dimensions"
    assert np.allclose(output, expected_output) and np.allclose(weights, expected_weights), "batched attention values are wrong"


def test_scales_by_the_square_root_of_the_key_width():
    rng = np.random.default_rng(2)
    Q, K, V = rng.normal(size=(3, 64)), rng.normal(size=(4, 64)), rng.normal(size=(4, 2))
    _, weights = scaled_dot_product_attention(Q, K, V)
    assert np.allclose(weights, reference(Q, K, V)[1]), "scores should be divided by sqrt(d_k)"


def test_large_scores_do_not_overflow():
    Q = np.array([[100.0, 100.0]])
    K = np.array([[100.0, 100.0], [-100.0, -100.0]])
    output, weights = scaled_dot_product_attention(Q, K, np.eye(2))
    assert np.all(np.isfinite(output)) and np.all(np.isfinite(weights)), "large scores should not produce inf or nan"
    assert np.allclose(weights, [[1.0, 0.0]]), "the matching key should take all the weight"


def test_a_causal_mask_hides_later_positions():
    rng = np.random.default_rng(4)
    X = rng.normal(size=(5, 4))
    causal = np.tril(np.ones((5, 5), dtype=bool))
    output, weights = scaled_dot_product_attention(X, X, X, causal)
    assert np.allclose(np.triu(weights, k=1), 0.0), "no position should attend to a later one"
    assert np.allclose(output, reference(X, X, X, causal)[0]), "causal attention values are wrong"
