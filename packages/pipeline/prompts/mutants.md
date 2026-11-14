Write at least {{count}} mutants of the reference solution of step `{{stepId}}`: plausible
wrong implementations a learner might write, each a complete replacement for
`solution.py` with the same signature. Make each one wrong in a single, realistic way —
a wrong axis, a missing scale factor, an off-by-one, the wrong dtype, a step done in the
wrong order, a mask applied after instead of before, an in-place change to an input —
and make them differ from each other. Each must run without crashing on ordinary inputs
and use only the packages the step allows, so that only the tests can tell it apart.
Do not write mutants that are merely slower, or that differ only in ways the step's
contract leaves open.

For each, give `description`: one line naming the bug, and `code`: the whole module.

The step and its files:

```json
{{files}}
```
