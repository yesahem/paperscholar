Plan the learning path for this paper: an ordered list of steps a learner implements one
after another, ending with the paper's method assembled from the earlier pieces.

{{options}}

**Rules.**

- Order the steps from primitives to composition. The last step is usually `type: "model"`,
  which assembles earlier steps into the method; the others are `type: "micro"`, one
  function each.
- One concept per step. A learner should finish a step in 10 to 40 minutes.
- Aim for {{targetSteps}} steps; never fewer than {{minSteps}} or more than {{maxSteps}}.
- Every step must be checkable by fast, deterministic unit tests on a CPU with small inputs:
  no dataset downloads, no training to convergence, no GPU, no randomness without a seed.
  Each test must finish well within a few seconds.
- Prefer the `numpy` environment. Use `torch` only when the step is about something NumPy
  makes impractical, such as autograd. Packages available: `numpy` has numpy; `torch` has
  numpy and torch. `allowedPackages` lists only what the solution needs from those.
- `prohibitedImports` must ban the library routine that would make the step trivial (for
  example `torch.nn.functional` for a softmax step, `torch.optim` for an optimiser, `sklearn`
  for anything it implements). Ban other frameworks the step does not need, such as `torch`
  in a NumPy step.
- `id` is a short kebab-case slug, unique in the plan; it becomes the step's address.
- `entryPoint` is the function or class the learner implements; `signature` is its full
  Python signature with type hints, for example
  `def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:`.
- `dependsOn` lists earlier steps whose functions this step calls. Their code will be
  provided to the learner as a module named `helpers`, so a step never asks the learner to
  rewrite an earlier answer.
- `chunkIds` cite the outline's chunks the step comes from, and `paperRefs` the places in
  the paper a learner can check: "§3.2", "Eq. 4", "Algorithm 1".
- List in `omitted` everything worth knowing that the path leaves out — training loops,
  experiments, variants — each with the reason, so the reviewer sees what is not covered.

The outline of the paper, produced earlier, follows as JSON:
