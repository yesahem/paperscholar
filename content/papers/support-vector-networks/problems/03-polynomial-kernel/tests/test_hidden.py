import numpy as np
from solution import polynomial_kernel


def test_degree_one_is_the_dot_product_plus_one():
    X = np.array([[1.0, -1.0], [2.0, 0.5]])
    Z = np.array([[0.0, 3.0]])
    assert np.allclose(polynomial_kernel(X, Z, 1), [[-2.0], [2.5]]), "degree 1 should give X . Z + 1"


def test_is_symmetric_for_a_set_against_itself():
    X = np.random.default_rng(5).normal(size=(6, 3))
    K = polynomial_kernel(X, X, 3)
    assert np.allclose(K, K.T), "K(X, X) should be symmetric"


def test_matches_a_loop_on_random_data():
    rng = np.random.default_rng(9)
    X, Z = rng.normal(size=(5, 4)), rng.normal(size=(7, 4))
    expected = np.array([[(float(x @ z) + 1.0) ** 4 for z in Z] for x in X])
    assert np.allclose(polynomial_kernel(X, Z, 4), expected), "every entry should be (x . z + 1) ** degree"
