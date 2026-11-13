import numpy as np
from solution import positional_encoding


def test_has_one_row_per_position():
    result = positional_encoding(10, 16)
    assert result.shape == (10, 16), f"expected shape (10, 16), got {result.shape}"


def test_position_zero_alternates_zero_and_one():
    result = positional_encoding(1, 6)
    assert np.allclose(result[0], [0, 1, 0, 1, 0, 1]), f"position 0 should be [0, 1, 0, 1, ...], got {result[0]}"


def test_matches_the_worked_example():
    result = positional_encoding(2, 4)
    expected = [np.sin(1.0), np.cos(1.0), np.sin(0.01), np.cos(0.01)]
    assert np.allclose(result[1], expected), f"position 1 with d_model = 4 should be {expected}, got {result[1]}"
