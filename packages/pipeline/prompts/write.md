Write every file of step {{position}} of the plan, `{{stepId}}`.

The step, as planned:

```json
{{step}}
```

{{dependencies}}

**Files.** One string each.

- `description` (Markdown): the task. Explain the idea, give the mathematics with every
  symbol defined, state the function contract exactly — arguments, return value, shapes,
  dtypes, whether inputs may be modified — include one small worked example with numbers a
  learner can check by hand, list common mistakes, and say where in the paper this comes
  from. A learner must be able to solve the step from this text alone: anything the tests
  check must be stated here. If the step uses helpers, document their interface here.
- `tutorial` (Markdown): intuition and background for someone who has not read the paper.
  Do not restate the description.
- `starter` (Python): the exact signature from the plan, a docstring, and
  `raise NotImplementedError`. Import what the signature's type hints need.
- `solution` (Python): a clear, correct reference implementation using only the allowed
  packages, the standard library and, if this step depends on others, `helpers`.
- `testsPublic` (pytest): {{publicTests}} tests covering the main behaviour.
- `testsHidden` (pytest): at least {{hiddenTests}} tests: edge cases, larger inputs,
  numerical checks.
- `helpers` (Python or null): if `dependsOn` is not empty, a module containing working
  implementations of the earlier steps' functions this step calls, with the signatures
  given above and a docstring each. Otherwise null.

**Tests.**

- Import from a module named `solution`: `from solution import {{entryPoint}}`.
- One behaviour per test. Names read as sentences, because learners see them:
  `test_rows_sum_to_one`.
- Every `assert` has a message written for the learner, saying what was expected. Hidden
  tests must not print whole expected arrays in their messages.
- Compute expected values independently where you can: closed forms, small cases worked
  by hand, invariants such as shapes, symmetry, or rows summing to one. Do not compute
  them by calling a copy of the reference solution.
- Make the tests strong enough that a plausible wrong implementation fails at least one of
  them: a wrong axis, a missing scale factor, an off-by-one, the wrong dtype, a step done in
  the wrong order.
- Seed any randomness (`np.random.default_rng(0)`, `torch.manual_seed(0)`). Keep inputs
  small so every test runs in well under a second.
- Use `np.allclose` or `torch.allclose` with sensible tolerances for floating-point values.

In `notes`, say in a sentence or two what you wrote, or on a repair what you changed.
