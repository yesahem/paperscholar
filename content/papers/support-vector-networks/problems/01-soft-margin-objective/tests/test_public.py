import numpy as np
from solution import soft_margin_objective


def test_matches_the_worked_example():
    w = np.array([1.0, 0.0])
    X = np.array([[2.0, 0.0], [0.5, 0.0]])
    y = np.array([1.0, 1.0])
    result = soft_margin_objective(w, 0.0, X, y, 1.0)
    assert abs(result - 1.0) < 1e-9, f"expected 1.0 for the worked example, got {result}"


def test_points_outside_the_margin_add_nothing():
    w = np.array([0.5, -0.5])
    X = np.array([[4.0, 0.0], [0.0, 4.0]])
    y = np.array([1.0, -1.0])
    result = soft_margin_objective(w, 0.0, X, y, 10.0)
    assert abs(result - 0.25) < 1e-9, f"only 0.5 * ||w||^2 = 0.25 should remain, got {result}"


def test_returns_a_python_float():
    result = soft_margin_objective(np.array([1.0]), 0.0, np.array([[1.0]]), np.array([1.0]), 1.0)
    assert isinstance(result, float), f"expected a Python float, got {type(result).__name__}"
