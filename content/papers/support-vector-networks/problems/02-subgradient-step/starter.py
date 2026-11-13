import numpy as np


def subgradient_step(
    w: np.ndarray, b: float, X: np.ndarray, y: np.ndarray, C: float, lr: float
) -> tuple[np.ndarray, float]:
    """One subgradient-descent step on the soft-margin objective.

    Active points have y_i * (w . x_i + b) < 1 (strictly).
    g_w = w - C * sum over active of y_i * x_i;  g_b = -C * sum over active of y_i.
    Returns (w - lr * g_w, b - lr * g_b) as (new (d,) array, Python float).
    """
    raise NotImplementedError
