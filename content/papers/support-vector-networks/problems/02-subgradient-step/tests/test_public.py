import numpy as np
from solution import subgradient_step


def test_matches_the_worked_example():
    w_new, b_new = subgradient_step(np.zeros(2), 0.0, np.array([[1.0, 2.0]]), np.array([1.0]), 1.0, 0.1)
    assert np.allclose(w_new, [0.1, 0.2]), f"expected w_new = [0.1, 0.2], got {w_new}"
    assert abs(b_new - 0.1) < 1e-12, f"expected b_new = 0.1, got {b_new}"


def test_points_outside_the_margin_only_shrink_w():
    w = np.array([1.0, 0.0])
    X = np.array([[2.0, 0.0], [3.0, 0.0]])
    w_new, b_new = subgradient_step(w, 0.0, X, np.array([1.0, 1.0]), 5.0, 0.5)
    assert np.allclose(w_new, [0.5, 0.0]), f"with no active points only the w term applies, got {w_new}"
    assert abs(b_new) < 1e-12, f"the bias should not move when no point is active, got {b_new}"


def test_does_not_modify_its_arguments():
    w = np.array([0.5, -0.5])
    X = np.array([[1.0, 1.0], [-1.0, 0.0]])
    y = np.array([1.0, -1.0])
    subgradient_step(w, 0.0, X, y, 1.0, 0.1)
    assert np.array_equal(w, [0.5, -0.5]), "w must not be modified in place"
    assert np.array_equal(X, [[1.0, 1.0], [-1.0, 0.0]]), "X must not be modified"
