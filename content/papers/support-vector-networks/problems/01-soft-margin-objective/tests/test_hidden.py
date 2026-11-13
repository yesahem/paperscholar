import numpy as np
from solution import soft_margin_objective


def test_a_misclassified_point_costs_more_than_one():
    result = soft_margin_objective(np.array([1.0]), 0.0, np.array([[-1.0]]), np.array([1.0]), 2.0)
    assert abs(result - 4.5) < 1e-9, "a point on the wrong side should cost C * (1 - margin)"


def test_the_bias_is_added_before_the_label():
    w = np.array([1.0, 1.0])
    X = np.array([[0.0, 0.0], [1.0, 1.0]])
    y = np.array([1.0, -1.0])
    result = soft_margin_objective(w, 0.5, X, y, 1.0)
    assert abs(result - 5.0) < 1e-9, "the margin is y * (w . x + b), with b inside the bracket"


def test_zero_penalty_leaves_only_the_margin_term():
    result = soft_margin_objective(np.array([3.0, 4.0]), 0.0, np.array([[-10.0, -10.0]]), np.array([1.0]), 0.0)
    assert abs(result - 12.5) < 1e-9, "with C = 0 only 0.5 * ||w||^2 should remain"


def test_matches_a_point_by_point_sum_on_random_data():
    rng = np.random.default_rng(7)
    X = rng.normal(size=(50, 4))
    y = np.where(rng.random(50) < 0.5, -1.0, 1.0)
    w = rng.normal(size=4)
    b, C = 0.3, 0.7
    expected = 0.5 * sum(float(wi) ** 2 for wi in w)
    for xi, yi in zip(X, y):
        margin = yi * (sum(float(a) * float(c) for a, c in zip(w, xi)) + b)
        expected += C * max(0.0, 1.0 - margin)
    result = soft_margin_objective(w, b, X, y, C)
    assert abs(result - expected) < 1e-9, "the objective should match a sum over the points"
