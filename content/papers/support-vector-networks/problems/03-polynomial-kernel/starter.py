import numpy as np


def polynomial_kernel(X: np.ndarray, Z: np.ndarray, degree: int) -> np.ndarray:
    """Polynomial kernel K[i, j] = (X[i] . Z[j] + 1) ** degree.

    X: (n, d) points. Z: (m, d) points. degree: positive integer.
    Returns an (n, m) float array.
    """
    raise NotImplementedError
