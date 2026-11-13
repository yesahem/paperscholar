import torch
from solution import update_moments


def test_matches_the_worked_example():
    zeros = torch.zeros(1, dtype=torch.float64)
    m_new, v_new, m_hat, v_hat = update_moments(zeros, zeros, torch.tensor([2.0], dtype=torch.float64), 1, 0.9, 0.999)
    assert torch.allclose(m_new, torch.tensor([0.2], dtype=torch.float64)), f"expected m_new = 0.2, got {m_new}"
    assert torch.allclose(v_new, torch.tensor([0.004], dtype=torch.float64)), f"expected v_new = 0.004, got {v_new}"
    assert torch.allclose(m_hat, torch.tensor([2.0], dtype=torch.float64)), f"expected m_hat = 2.0, got {m_hat}"
    assert torch.allclose(v_hat, torch.tensor([4.0], dtype=torch.float64)), f"expected v_hat = 4.0, got {v_hat}"


def test_leaves_its_inputs_unchanged():
    m = torch.ones(3, dtype=torch.float64)
    v = torch.ones(3, dtype=torch.float64)
    grad = torch.full((3,), 5.0, dtype=torch.float64)
    update_moments(m, v, grad, 2, 0.9, 0.999)
    assert torch.equal(m, torch.ones(3, dtype=torch.float64)), "m must not be modified in place"
    assert torch.equal(v, torch.ones(3, dtype=torch.float64)), "v must not be modified in place"
