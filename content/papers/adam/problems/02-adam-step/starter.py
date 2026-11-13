import torch


def adam_step(
    param: torch.Tensor,
    grad: torch.Tensor,
    state: dict,
    lr: float = 1e-3,
    beta1: float = 0.9,
    beta2: float = 0.999,
    eps: float = 1e-8,
) -> tuple[torch.Tensor, dict]:
    """One Adam update: param - lr * m_hat / (sqrt(v_hat) + eps).

    state: {"step": int, "m": tensor, "v": tensor}; step is 0 before the first update.
    `from helpers import update_moments` is available.
    Returns (new_param, new_state) without modifying the inputs.
    """
    raise NotImplementedError
