import numpy as np
from solution import scaled_dot_product_attention


def test_matches_the_worked_example():
    output, weights = scaled_dot_product_attention(
        np.array([[1.0, 0.0]]), np.array([[1.0, 0.0], [0.0, 1.0]]), np.array([[1.0, 2.0], [3.0, 4.0]])
    )
    assert np.allclose(weights, [[0.66976, 0.33024]], atol=1e-4), f"unexpected weights {weights}"
    assert np.allclose(output, [[1.66048, 2.66048]], atol=1e-4), f"unexpected output {output}"


def test_each_query_weights_sum_to_one():
    rng = np.random.default_rng(0)
    _, weights = scaled_dot_product_attention(rng.normal(size=(4, 8)), rng.normal(size=(6, 8)), rng.normal(size=(6, 3)))
    assert weights.shape == (4, 6), f"weights should have shape (n_q, n_k) = (4, 6), got {weights.shape}"
    assert np.allclose(weights.sum(axis=-1), 1.0), "each row of weights should sum to 1"


def test_masked_keys_get_zero_weight():
    Q = np.ones((2, 2))
    K = np.ones((3, 2))
    V = np.arange(6.0).reshape(3, 2)
    mask = np.array([[True, False, True], [False, False, True]])
    output, weights = scaled_dot_product_attention(Q, K, V, mask)
    assert np.allclose(weights, [[0.5, 0.0, 0.5], [0.0, 0.0, 1.0]]), f"masked keys should get weight 0, got {weights}"
    assert np.allclose(output[1], V[2]), "a query allowed only one key should return that key's value"
