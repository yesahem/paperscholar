import numpy as np


def soft_margin_objective(w: np.ndarray, b: float, X: np.ndarray, y: np.ndarray, C: float) -> float:
    margins = y * (X @ w + b)
    hinge = np.maximum(0.0, 1.0 - margins)
    return float(0.5 * np.dot(w, w) + C * hinge.sum())
