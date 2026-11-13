# Content library

The papers every PaperScholar instance starts with. Each paper is a folder of plain files,
reviewed by pull request and checked by CI. The full format is in
[`docs/specs/03-content.md`](../docs/specs/03-content.md); this page is the quick guide.

```
papers/<paper-id>/
  paper.yaml
  problems/<NN>-<problem-id>/
    problem.yaml        metadata, limits and import rules
    description.md      the task: maths, shapes, dtypes, an example, common mistakes
    tutorial.md         optional background
    starter.py          the signature, a docstring, raise NotImplementedError
    solution.py         the reference solution (never shown)
    helpers.py          optional: earlier steps' code this step may import as `helpers`
    tests/test_public.py   2–6 tests, run on Run and Submit
    tests/test_hidden.py   3 or more tests, run on Submit; learners see only names and messages
tracks/<track-id>.yaml
```

## Writing a problem

- Tests import from `solution`. One behaviour per test, named as a sentence
  (`test_masked_keys_get_zero_weight`), because learners see the name.
- Every `assert` has a message written for the learner. Hidden-test messages must not print
  whole expected arrays.
- Seed every random generator. Compute expected values independently of the solution
  where you can: closed forms, small hand-checked cases, invariants.
- Markdown uses GFM and LaTeX (`$...$`, `$$...$$`). No raw HTML.
- Text is original. Link to the paper; quote it only briefly and with a reference.

## Checking your work

```sh
bun run runner:setup        # once: the local Python environment
bun run content:verify --paper <paper-id>
```

`content:verify` proves the solution passes, the starter fails, imports follow the
problem's rules, tests are fast and deterministic, and the files are well-formed. A pull
request that adds or changes a paper cannot merge unless it passes.

YAML files use one canonical style, so `bun run content:export <paper-id>` reproduces them
exactly; keep that style when editing by hand.
