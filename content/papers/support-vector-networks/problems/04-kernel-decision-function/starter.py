import numpy as np


def decision_function(
    alphas: np.ndarray, y: np.ndarray, X_support: np.ndarray, b: float, X: np.ndarray, degree: int
) -> np.ndarray:
    """f(x) = sum_i alphas[i] * y[i] * K(X_support[i], x) + b, with K(u, v) = (u . v + 1) ** degree.

    `from helpers import polynomial_kernel` gives the kernel matrix between two sets of points.
    Returns an (m,) float array, one score per row of X.
    """
    raise NotImplementedError
