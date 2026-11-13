import torch
from solution import update_moments


def test_the_second_step_uses_beta_to_the_power_two():
    m = torch.tensor([0.2], dtype=torch.float64)
    v = torch.tensor([0.004], dtype=torch.float64)
    m_new, v_new, m_hat, v_hat = update_moments(m, v, torch.tensor([-1.0], dtype=torch.float64), 2, 0.9, 0.999)
    assert torch.allclose(m_new, torch.tensor([0.08], dtype=torch.float64)), "m should decay by beta1 and add (1 - beta1) * grad"
    assert torch.allclose(m_hat, torch.tensor([0.08 / 0.19], dtype=torch.float64)), "step 2 should divide m by 1 - beta1 ** 2"
    expected_v = 0.999 * 0.004 + 0.001
    assert torch.allclose(v_hat, torch.tensor([expected_v / (1 - 0.999**2)], dtype=torch.float64)), "step 2 should divide v by 1 - beta2 ** 2"


def test_keeps_the_shape_of_the_gradient():
    shape = (2, 3, 4)
    results = update_moments(torch.zeros(shape), torch.zeros(shape), torch.randn(shape, generator=torch.Generator().manual_seed(0)), 1, 0.9, 0.99)
    assert all(result.shape == shape for result in results), "every returned tensor should have the gradient's shape"


def test_the_correction_fades_after_many_steps():
    m = torch.tensor([0.5], dtype=torch.float64)
    v = torch.tensor([0.25], dtype=torch.float64)
    m_new, v_new, m_hat, v_hat = update_moments(m, v, torch.tensor([0.5], dtype=torch.float64), 100_000, 0.9, 0.999)
    assert torch.allclose(m_hat, m_new) and torch.allclose(v_hat, v_new), "after many steps the corrected estimates should equal the raw ones"


def test_matches_elementwise_formulas_on_random_tensors():
    generator = torch.Generator().manual_seed(1)
    m, v = torch.randn(10, generator=generator, dtype=torch.float64), torch.rand(10, generator=generator, dtype=torch.float64)
    grad = torch.randn(10, generator=generator, dtype=torch.float64)
    m_new, v_new, m_hat, v_hat = update_moments(m, v, grad, 3, 0.8, 0.95)
    for i in range(10):
        expected_m = 0.8 * float(m[i]) + 0.2 * float(grad[i])
        expected_v = 0.95 * float(v[i]) + 0.05 * float(grad[i]) ** 2
        assert abs(float(m_hat[i]) - expected_m / (1 - 0.8**3)) < 1e-12, "m_hat differs from the formula"
        assert abs(float(v_hat[i]) - expected_v / (1 - 0.95**3)) < 1e-12, "v_hat differs from the formula"
