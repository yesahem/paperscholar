import torch
from helpers import update_moments


def adam_step(
    param: torch.Tensor,
    grad: torch.Tensor,
    state: dict,
    lr: float = 1e-3,
    beta1: float = 0.9,
    beta2: float = 0.999,
    eps: float = 1e-8,
) -> tuple[torch.Tensor, dict]:
    step = state["step"] + 1
    m, v, m_hat, v_hat = update_moments(state["m"], state["v"], grad, step, beta1, beta2)
    new_param = param - lr * m_hat / (torch.sqrt(v_hat) + eps)
    return new_param, {"step": step, "m": m, "v": v}
