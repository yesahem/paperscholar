import numpy as np


def subgradient_step(
    w: np.ndarray, b: float, X: np.ndarray, y: np.ndarray, C: float, lr: float
) -> tuple[np.ndarray, float]:
    margins = y * (X @ w + b)
    active = margins < 1.0
    grad_w = w - C * (y[active] @ X[active])
    grad_b = -C * float(y[active].sum())
    return w - lr * grad_w, float(b - lr * grad_b)
