import torch
from solution import adam_step


def fresh_state(like):
    return {"step": 0, "m": torch.zeros_like(like), "v": torch.zeros_like(like)}


def test_matches_pytorchs_adam_over_several_steps():
    generator = torch.Generator().manual_seed(0)
    start = torch.randn(4, 3, generator=generator, dtype=torch.float64)
    gradients = [torch.randn(4, 3, generator=generator, dtype=torch.float64) for _ in range(6)]

    reference = start.clone().requires_grad_(True)
    optimiser = torch.optim.Adam([reference], lr=0.01, betas=(0.8, 0.99), eps=1e-6)
    param, state = start.clone(), fresh_state(start)
    for gradient in gradients:
        reference.grad = gradient.clone()
        optimiser.step()
        param, state = adam_step(param, gradient, state, lr=0.01, beta1=0.8, beta2=0.99, eps=1e-6)
    assert torch.allclose(param, reference.detach(), atol=1e-12), "six steps should match torch.optim.Adam"
    assert state["step"] == 6, "the state should count six steps"


def test_the_first_step_moves_each_parameter_by_about_lr():
    param = torch.zeros(3, dtype=torch.float64)
    grad = torch.tensor([1e-4, 3.0, -500.0], dtype=torch.float64)
    new_param, _ = adam_step(param, grad, fresh_state(param), lr=0.05)
    assert torch.allclose(new_param.abs(), torch.full((3,), 0.05, dtype=torch.float64), rtol=1e-3), "the first step should have size lr whatever the gradient's scale"
    assert torch.equal(torch.sign(new_param), -torch.sign(grad)), "each parameter should move against its gradient"


def test_the_state_keeps_the_raw_averages():
    param = torch.zeros(1, dtype=torch.float64)
    _, state = adam_step(param, torch.tensor([2.0], dtype=torch.float64), fresh_state(param), beta1=0.9, beta2=0.999)
    assert torch.allclose(state["m"], torch.tensor([0.2], dtype=torch.float64)), "state['m'] should hold m, not the corrected m_hat"
    assert torch.allclose(state["v"], torch.tensor([0.004], dtype=torch.float64)), "state['v'] should hold v, not the corrected v_hat"


def test_minimises_a_quadratic():
    target = torch.tensor([3.0, -2.0], dtype=torch.float64)
    param = torch.zeros(2, dtype=torch.float64)
    state = fresh_state(param)
    for _ in range(500):
        param, state = adam_step(param, 2 * (param - target), state, lr=0.05)
    assert torch.allclose(param, target, atol=1e-2), "Adam should find the minimum of (param - target) ** 2"
