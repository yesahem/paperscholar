import numpy as np
from solution import decision_function


def test_matches_the_worked_example():
    result = decision_function(
        np.array([0.5, 0.5]), np.array([1.0, -1.0]), np.eye(2), 0.0, np.array([[1.0, 0.0]]), 1
    )
    assert np.allclose(result, [0.5]), f"expected [0.5], got {result}"


def test_zero_weights_leave_only_the_bias():
    result = decision_function(np.zeros(3), np.ones(3), np.ones((3, 2)), -0.25, np.ones((4, 2)), 2)
    assert np.allclose(result, np.full(4, -0.25)), f"with every alpha zero, f should equal b, got {result}"
