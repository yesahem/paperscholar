# `@repo/pipeline`

The paper pipeline (docs/specs/09-paper-pipeline.md). M1 ships its verification half.

## `verifyProblem(problem, { provider })`

Runs a problem through the sandbox and reports each check:

| Check                  | Passes when                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| V1 Well-formed         | every file parses; starter and solution define the entry point; tests import `solution`; no raw HTML in markdown |
| V2 Solution is correct | the reference solution passes every public and hidden test                                                       |
| V3 Starter is unsolved | the starter fails the public tests, by failing tests rather than an error                                        |
| V4 Import policy       | the solution obeys the problem's own import rules                                                                |
| V5 Fast enough         | every test finishes in under half the problem's time limit                                                       |
| V6 Deterministic       | three runs give identical per-test outcomes                                                                      |
| V10 Test hygiene       | 2–6 public tests, at least 3 hidden, every `assert` has a message                                                |

V7–V9 (mutation testing, independent solve, fidelity review) need a model and arrive in M6.

## `content:verify`

```sh
bun run content:verify [--content <dir>] [--paper <id>] [--concurrency <n>]
```

Verifies every problem in `content/` with the local runner. Exit code 1 if any problem fails,
2 if the folder itself is invalid. CI runs it on every push.
