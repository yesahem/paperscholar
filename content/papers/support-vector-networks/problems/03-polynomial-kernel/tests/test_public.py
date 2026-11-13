import numpy as np
from solution import polynomial_kernel


def test_matches_the_worked_example():
    result = polynomial_kernel(np.array([[1.0, 2.0]]), np.array([[3.0, 4.0], [0.0, 0.0]]), 2)
    assert np.allclose(result, [[144.0, 1.0]]), f"expected [[144, 1]], got {result}"


def test_has_one_row_per_x_and_one_column_per_z():
    result = polynomial_kernel(np.ones((4, 3)), np.ones((2, 3)), 3)
    assert result.shape == (4, 2), f"expected shape (4, 2), got {result.shape}"
