import torch
from solution import adam_step


def fresh_state(like):
    return {"step": 0, "m": torch.zeros_like(like), "v": torch.zeros_like(like)}


def test_matches_the_worked_example():
    param = torch.tensor([1.0], dtype=torch.float64)
    new_param, new_state = adam_step(param, torch.tensor([2.0], dtype=torch.float64), fresh_state(param), lr=0.1)
    assert torch.allclose(new_param, torch.tensor([0.9], dtype=torch.float64)), f"expected about [0.9], got {new_param}"
    assert new_state["step"] == 1, f"the step count should become 1, got {new_state['step']}"


def test_leaves_its_inputs_unchanged():
    param = torch.ones(3, dtype=torch.float64)
    state = fresh_state(param)
    adam_step(param, torch.ones(3, dtype=torch.float64), state)
    assert torch.equal(param, torch.ones(3, dtype=torch.float64)), "param must not be modified in place"
    assert state["step"] == 0 and torch.equal(state["m"], torch.zeros(3, dtype=torch.float64)), "state must not be modified"
