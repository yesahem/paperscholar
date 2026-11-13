import numpy as np


def soft_margin_objective(w: np.ndarray, b: float, X: np.ndarray, y: np.ndarray, C: float) -> float:
    """Soft-margin objective: 0.5 * ||w||^2 + C * sum(max(0, 1 - y_i * (w . x_i + b))).

    w: (d,) weights. b: bias. X: (n, d) points, one per row.
    y: (n,) labels, each -1.0 or +1.0. C: non-negative penalty weight.
    Returns the objective as a Python float.
    """
    raise NotImplementedError
