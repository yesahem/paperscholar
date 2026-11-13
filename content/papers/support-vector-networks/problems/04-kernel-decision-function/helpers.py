import numpy as np


def polynomial_kernel(X: np.ndarray, Z: np.ndarray, degree: int) -> np.ndarray:
    return (X @ Z.T + 1.0) ** degree
