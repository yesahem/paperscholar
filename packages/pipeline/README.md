# `@repo/pipeline`

The paper pipeline (docs/specs/09-paper-pipeline.md): it turns a PDF into verified learning
steps. **The model writes, the sandbox verifies, a maintainer approves.** It receives its
database, storage, sandbox and `LlmClient` as arguments and imports no vendor SDK; the
backend supplies the Anthropic client.

## Pieces

| Module                        | What                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `intake.ts`, `arxiv.ts`       | PDF checks, dedupe by hash and arXiv id, the daily limit; downloads from arxiv.org only      |
| `engine/tick.ts`              | `tick()`: claims tasks under a lease, runs them, completes or retries them (§13)             |
| `stages/`                     | `read`, `plan` (and add-step), `write` (with repairs), `verify` (V1–V10), `assemble`         |
| `stages/model-checks.ts`      | V7 mutants, V8 independent solve, V9 fidelity                                                |
| `review.ts`                   | Edits, re-verification, regeneration, waivers, publish, cancel, retry, discard (§10–§12)     |
| `eval.ts`                     | The measures of §18, used by the CMS eval                                                    |
| `llm/types.ts`, `llm/fake.ts` | The `LlmClient` interface and the scripted fake; `llm/demo-paper.ts` is what the fake writes |
| `prompts/`                    | One file per stage, versioned by `PROMPT_VERSION` in `prompts.ts`                            |

Content the pipeline produces lives in storage under `ingestions/<id>/` and, once
assembled, as the paper's draft. The database holds only state: `ingestions`,
`ingestion_steps`, `pipeline_tasks`.

Changing a prompt is a code change: bump `PROMPT_VERSION` and run the eval
(an admin starts it in the CMS; it spends real money) before merging.

## `verifyProblem(problem, { provider })`

Runs a problem through the sandbox and reports the checks that need no model:

| Check                  | Passes when                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| V1 Well-formed         | every file parses; starter and solution define the entry point; tests import `solution`; no raw HTML in markdown |
| V2 Solution is correct | the reference solution passes every public and hidden test                                                       |
| V3 Starter is unsolved | the starter fails the public tests, by failing tests rather than an error                                        |
| V4 Import policy       | the solution obeys the problem's own import rules                                                                |
| V5 Fast enough         | every test finishes in under half the problem's time limit                                                       |
| V6 Deterministic       | three runs give identical per-test outcomes                                                                      |
| V10 Test hygiene       | 2–6 public tests, at least 3 hidden, every `assert` has a message                                                |

In the pipeline, V7–V9 run after these pass (`stages/verify.ts`, `runChecks`).

## `content:verify`

```sh
bun run content:verify [--content <dir>] [--paper <id>] [--concurrency <n>]
```

Verifies every problem in `content/` with the local runner. Exit code 1 if any problem fails,
2 if the folder itself is invalid. CI runs it on every push.

## Tests

The pipeline's tests run whole ingestions with the fake model against real Postgres
(`DATABASE_URL`, see `.env.example`) and the local Python runner; without either they are
skipped.
