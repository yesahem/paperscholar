import numpy as np
from solution import subgradient_step


def soft_margin_objective(w, b, X, y, C):
    return 0.5 * float(w @ w) + C * float(np.maximum(0.0, 1.0 - y * (X @ w + b)).sum())


def test_a_margin_of_exactly_one_is_not_active():
    w_new, b_new = subgradient_step(np.array([1.0]), 0.0, np.array([[1.0]]), np.array([1.0]), 3.0, 0.5)
    assert np.allclose(w_new, [0.5]), "a point with margin exactly 1 should not contribute"
    assert abs(b_new) < 1e-12, "a point with margin exactly 1 should not move the bias"


def test_negative_labels_push_the_other_way():
    w_new, b_new = subgradient_step(np.zeros(2), 0.0, np.array([[1.0, 1.0]]), np.array([-1.0]), 2.0, 0.25)
    assert np.allclose(w_new, [-0.5, -0.5]), "an active negative point should push w away from itself"
    assert abs(b_new + 0.5) < 1e-12, "an active negative point should lower the bias"


def test_returns_an_array_and_a_python_float():
    w_new, b_new = subgradient_step(np.zeros(3), 0.0, np.ones((2, 3)), np.array([1.0, -1.0]), 1.0, 0.1)
    assert isinstance(w_new, np.ndarray) and w_new.shape == (3,), "w_new should be an array of shape (d,)"
    assert isinstance(b_new, float), "b_new should be a Python float"


def test_matches_a_loop_on_random_data():
    rng = np.random.default_rng(3)
    X = rng.normal(size=(40, 5))
    y = np.where(rng.random(40) < 0.5, -1.0, 1.0)
    w, b, C, lr = rng.normal(size=5) * 0.3, 0.1, 0.8, 0.05
    grad_w, grad_b = w.copy(), 0.0
    for xi, yi in zip(X, y):
        if yi * (float(w @ xi) + b) < 1.0:
            grad_w = grad_w - C * yi * xi
            grad_b -= C * yi
    w_new, b_new = subgradient_step(w, b, X, y, C, lr)
    assert np.allclose(w_new, w - lr * grad_w), "w_new should match a point-by-point subgradient"
    assert abs(b_new - (b - lr * grad_b)) < 1e-9, "b_new should match a point-by-point subgradient"


def test_repeated_steps_lower_the_objective_on_separable_data():
    rng = np.random.default_rng(11)
    X = np.vstack([rng.normal(2.0, 0.5, size=(20, 2)), rng.normal(-2.0, 0.5, size=(20, 2))])
    y = np.concatenate([np.ones(20), -np.ones(20)])
    w, b = np.zeros(2), 0.0
    start = soft_margin_objective(w, b, X, y, 1.0)
    for _ in range(200):
        w, b = subgradient_step(w, b, X, y, 1.0, 0.01)
    assert soft_margin_objective(w, b, X, y, 1.0) < 0.2 * start, "training should cut the objective sharply"
