import numpy as np
from helpers import polynomial_kernel


def decision_function(
    alphas: np.ndarray, y: np.ndarray, X_support: np.ndarray, b: float, X: np.ndarray, degree: int
) -> np.ndarray:
    kernel = polynomial_kernel(X_support, X, degree)
    return (alphas * y) @ kernel + b
