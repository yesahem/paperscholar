# `@repo/runner`

Turns code plus a problem's tests into a structured result, inside a sandbox.
Spec: docs/specs/07-runner.md.

```ts
import { buildRunRequest, LocalProvider, toVerdict } from "@repo/runner";

const result = await provider.run(
  buildRunRequest(problem, { runId, code, mode: "submit" }),
);
toVerdict(result); // { status, verdict: "passed" | "failed" | …, testsPassed, testsTotal }
```

## Pieces

| Path                      | What                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness/harness.py`      | The single command a sandbox runs. Scans imports with `ast`, runs pytest in a child process with limits, writes `result.json`. Also an `inspect` action that parses files without running them. |
| `harness/conftest.py`     | Records one event per test, enforces the per-test time limit, and decides what a failure may reveal: hidden tests show only their name and the author's message.                                |
| `src/providers/local.ts`  | `LocalProvider`: runs the harness as a subprocess. **Not a security boundary**; refuses to start when `NODE_ENV=production`.                                                                    |
| `src/providers/http.ts`   | `HttpRunnerProvider`: sends runs to the bundled runner service (`apps/runner`) with a bearer token.                                                                                             |
| `src/providers/vercel.ts` | `VercelSandboxProvider`: one Vercel Sandbox microVM per run, outbound network denied, stopped in `finally`.                                                                                     |
| `src/adversarial.ts`      | The hostile submissions of spec 07 §10 and `runAdversarialSuite()`.                                                                                                                             |
| `src/verdict.ts`          | `toVerdict()`: the table in spec 07 §7.                                                                                                                                                         |
| `environments/`           | Pinned packages of the `numpy` and `torch` sandbox images, and the Python version.                                                                                                              |
| `images/Dockerfile`       | The sandbox image for one environment, used by the bundled runner and pushed to Vercel's registry for the hosted sandbox.                                                                       |

## Sandbox images and the adversarial suite

```sh
bun run runner:images                                     # builds paperscholar-sandbox-numpy and -torch
bun run runner:images --platform linux/amd64 --tag-prefix <registry>/ --push   # for Vercel Sandbox
RUNNER_URL=http://localhost:8798 RUNNER_TOKEN=… bun run runner:adversarial --provider http
bun run runner:adversarial --provider vercel              # RUNNER_IMAGE_* and Vercel credentials
```

The suite refuses the local provider: it includes a fork bomb and a 10 GB allocation.

## Python for local runs

```sh
bun run runner:setup     # needs uv; creates packages/runner/.venv with NumPy, pytest and CPU PyTorch
```

Local runs use `RUNNER_PYTHON` if set, else that virtual environment, else `python3`. In CI
(`CI` set) the harness tests fail instead of skipping when Python is missing.

## Import policy

A submission may import the standard library (minus a denylist such as `os`, `sys`,
`subprocess`, `socket`, `importlib`, `inspect`), the problem's `allowed_packages`, and
`helpers` when the problem has one. `prohibited_imports` may name a module (`torch`) or a
submodule path (`torch.optim`); paths are caught in imports, `from` imports and attribute
chains such as `torch.optim.Adam`. Calls to `eval`, `exec`, `compile`, `open`, `input` and
`breakpoint` are refused too. This is a teaching rule, not a security control: isolation
comes from the sandbox.
