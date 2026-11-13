import math

import numpy as np
from solution import positional_encoding


def test_each_sine_and_cosine_pair_shares_a_frequency():
    result = positional_encoding(50, 32)
    norms = result[:, 0::2] ** 2 + result[:, 1::2] ** 2
    assert np.allclose(norms, 1.0), "columns 2i and 2i + 1 should be the sine and cosine of one angle"


def test_slow_columns_use_the_right_frequency():
    result = positional_encoding(200, 512)
    angle = 137 / 10000 ** (500 / 512)
    assert abs(result[137, 500] - math.sin(angle)) < 1e-9, "column 2i should use pos / 10000 ** (2i / d_model)"
    assert abs(result[137, 501] - math.cos(angle)) < 1e-9, "column 2i + 1 should use the same angle as 2i"


def test_a_single_position_with_width_two():
    result = positional_encoding(1, 2)
    assert result.shape == (1, 2) and np.allclose(result, [[0.0, 1.0]]), "the smallest case should be [[0, 1]]"


def test_returns_floats():
    assert np.issubdtype(positional_encoding(3, 4).dtype, np.floating), "the encoding should be a float array"
