import torch


def update_moments(
    m: torch.Tensor, v: torch.Tensor, grad: torch.Tensor, step: int, beta1: float, beta2: float
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Adam's moment update for step t = `step` (starting at 1).

    m_new = beta1 * m + (1 - beta1) * grad;  v_new = beta2 * v + (1 - beta2) * grad**2
    m_hat = m_new / (1 - beta1**step);       v_hat = v_new / (1 - beta2**step)
    Returns new tensors (m_new, v_new, m_hat, v_hat); the inputs are left unchanged.
    """
    raise NotImplementedError
