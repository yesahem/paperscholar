# 07 — Runner

How a submission becomes a verdict. This is the part of the system that executes code
written by strangers, so it is specified most tightly.

## 1. Principles

1. **The sandbox is the security boundary.** Each run gets its own short-lived isolated
   environment with no network and no secrets. Everything else is defence in depth.
2. **The import scan is a teaching rule, not a security control.** It enforces "implement
   it yourself". It is not relied on to contain malicious code.
3. **The API process never executes user code**, never `eval`s it, and never imports it.
4. **Results are structured.** The harness emits JSON with one record per test.
5. **Our failures are not the user's.** Sandbox or harness faults produce `internal_error`.
6. **One runner for everything.** Learner submissions, `content:verify`, and the paper
   pipeline's checks (spec 09 §8) all go through the same `SandboxProvider`, images and
   harness. A step verified by the pipeline is verified under the conditions a learner
   will meet.

## 2. Pieces

```
apps/backend  ──▶  SubmissionService  ──▶  SandboxProvider.run(RunRequest)  ──▶  RunResult
                     │                        │
                     │                        ├─ LocalProvider         (dev, CI)
                     ▼                        ├─ HttpRunnerProvider    (self-hosted: bundled Docker runner)
                 Postgres                     ├─ VercelSandboxProvider (hosted default)
                                              └─ E2BProvider           (hosted alternative)
```

`packages/runner` contains:

- `types.ts` — `RunRequest`, `RunResult`, `SandboxProvider`
- `providers/` — one file per provider
- `harness/harness.py`, `harness/conftest.py` — the Python side
- `environments/numpy.txt`, `environments/torch.txt` — pinned Python requirements
- `build.ts` — assembles a `RunRequest` from a problem and submitted code

## 3. Submission lifecycle

```
queued ──▶ running ──▶ completed   (verdict set)
   │          │
   └──────────┴──────▶ error       (verdict = internal_error)
```

### Create — `POST /v1/submissions`

After the checks in spec 05 §6:

1. Reap this user's stale in-flight submissions (see "Reaping").
2. Insert the row with `status = 'queued'`. A unique-index violation means another run is
   in flight → `409 submission_in_progress`.
3. Hand the ID to the dispatcher.
4. Respond `202 { id, status: "queued" }`.

### Dispatch

```ts
interface JobDispatcher {
  dispatch(submissionId: string): void;
}
```

- `InlineDispatcher` (default): calls `execute(id)` and registers the promise with the
  host's `waitUntil`, so the function instance stays alive after the response is sent.
- `QueueDispatcher` (later, if needed): publishes the ID to a queue whose consumer calls
  an internal endpoint. Same `execute`. Adopt this if inline runs are lost in practice.

The submissions function is configured with `maxDuration` of 120 seconds.

> **Built in M4.** The inline dispatcher is `runInBackground(submissions.execute(id))`,
> which is `waitUntil` on Vercel and a plain detached promise under `Bun.serve`. The
> backend deploys as one function (`apps/backend/src/index.ts`), so `vercel.json` sets
> `maxDuration` 120 on it as a whole. The run is aborted after 90 s (`RUN_ABORT_MS`).

### Execute

1. Claim: `update submissions set status='running', started_at=now() where id=$1 and
status='queued'`. Zero rows affected means someone else has it; stop.
2. Build the `RunRequest` from the paper's current `public.json` and `private.json` in
   storage, through the content cache (spec 03 §2.3).
3. Call `provider.run(request)` with a 90-second abort signal.
4. Map the `RunResult` to a verdict (§7).
5. Persist, in one transaction, as specified in spec 04 §5.1.
6. On any thrown error: set `status='error'`, `verdict='internal_error'`, and log with the
   submission ID.

`execute` is idempotent. The claim in step 1 makes a duplicate dispatch harmless.

### Poll — `GET /v1/submissions/:id`

The client polls every 1 second for the first 10 seconds, then every 2 seconds, and gives
up after 120 seconds with a "taking too long" message and a retry button.

### Reaping

A submission still `queued` or `running` 120 seconds after `created_at` is stale: its
function instance died. It is set to `error` / `internal_error`:

- lazily, when read by `GET /v1/submissions/:id`;
- before inserting a new submission for the same user;
- by the daily cleanup job.

So a user is never blocked by a lost run for more than two minutes.

## 4. Interface

As built in M1 (`packages/runner/src/types.ts`). Results come from inside the sandbox, so
they are validated with zod like any untrusted input.

```ts
type RunFile = { path: string; content: string }; // e.g. "solution.py", "tests/test_public.py"

type HarnessSpec = {
  action: "test" | "inspect";
  entryPoint: string;
  allowedPackages: string[];
  prohibitedImports: string[]; // modules ("torch") or submodule paths ("torch.optim")
  hasHelpers: boolean; // the runner's own request; stored content has helpersInterface (spec 03 §2.1)
  perTestTimeoutSeconds: number;
  memoryLimitMb: number;
  wallClockLimitSeconds: number; // 60
  applyMemoryLimit: boolean; // false for the torch environment
  applyProcessLimit: boolean; // true only under a dedicated sandbox user
  inspectFiles: string[]; // for action "inspect"
};

type RunRequest = {
  runId: string; // a submission id, or a verification run id
  environment: "numpy" | "torch";
  files: RunFile[]; // the provider adds harness.py, conftest.py and spec.json
  spec: HarnessSpec;
};

type RunResult = {
  outcome:
    | "completed" // pytest ran to the end
    | "import_violation"
    | "collection_error" // the submission failed to import: syntax error, missing entry point
    | "timeout" // whole-run wall clock exceeded, or the import took longer than one test's limit
    | "out_of_memory"
    | "harness_error"; // our fault, including a test file that fails to load
  tests: {
    name: string;
    group: "public" | "hidden";
    status: "passed" | "failed" | "error";
    durationMs: number;
    message: string | null;
    traceback: string | null;
    stdout: string | null;
    timedOut: boolean; // hit the per-test time limit
  }[];
  violations: string[]; // for import_violation
  errorOutput: string | null; // for collection_error and harness_error
  durationMs: number;
  inspection?: { files: InspectedFile[] }; // for action "inspect"
};

interface SandboxProvider {
  readonly name: string;
  run(request: RunRequest, signal?: AbortSignal): Promise<RunResult>;
}
```

`buildRunRequest(problem, { runId, code, mode })` assembles a test run; hidden tests are
included only in `submit` mode. `buildInspectRequest` assembles an `inspect` run, which
parses files and reports their definitions, imports, test functions and assertions without
executing anything. Verification check V1 and V10 use it.

Files written into the sandbox working directory:

| File                        | Source                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `solution.py`               | The code under test, verbatim                                 |
| `tests/test_public.py`      | The paper's `private.json`                                    |
| `tests/test_hidden.py`      | The paper's `private.json` — **only when `mode` is `submit`** |
| `helpers.py`                | The paper's `private.json`, when the problem has helpers      |
| `conftest.py`, `harness.py` | `packages/runner/harness/`, bundled as text                   |
| `spec.json`                 | The `HarnessSpec`                                             |

Request paths must match `^(tests/)?[a-z0-9_]+\.py$` and may not overwrite the harness
files. For a learner's submission, the reference solution is never sent to the sandbox.
When the pipeline or `content:verify` checks a problem, the code under test (the reference
solution, the starter, a mutant, or an independent solver's answer) is written as
`solution.py` in exactly the same way.

## 5. The harness

`harness.py` is the single command the provider runs. It writes `result.json`, which the
provider reads back. For the `test` action it does four things in order.

**1. Import scan.** Parse `solution.py` with Python's `ast` module, without executing it.
The run ends with `import_violation` if the code:

- imports a module in the problem's `prohibited_imports`;
- uses a prohibited submodule path such as `torch.optim`, in an import, a `from` import, or
  an attribute chain like `torch.optim.Adam` (also through `import torch as t`);
- imports a standard-library module on the denylist: `_thread`, `asyncio`, `builtins`,
  `code`, `codeop`, `concurrent`, `ctypes`, `fcntl`, `ftplib`, `gc`, `http`, `importlib`,
  `inspect`, `io`, `marshal`, `mmap`, `multiprocessing`, `os`, `pathlib`, `pickle`, `pty`,
  `requests`, `resource`, `runpy`, `select`, `selectors`, `shutil`, `signal`, `smtplib`,
  `socket`, `ssl`, `subprocess`, `sys`, `tempfile`, `threading`, `tty`, `urllib`, `xmlrpc`;
- imports anything that is neither standard library nor in `allowed_packages` (`helpers` is
  allowed when the problem provides it), or uses a relative import;
- calls `eval`, `exec`, `compile`, `open`, `input` or `breakpoint`, uses the names
  `__import__`, `__builtins__`, `__loader__`, `__spec__`, or the attributes `__subclasses__`,
  `__globals__`, `__builtins__`, `__code__`, `__bases__`, `__base__`, `__mro__`.

A syntax error at this stage ends the run with `collection_error`.

**2. Resource limits**, applied in the child before pytest starts, best effort: core dumps
off; written files capped at 16 MB; on Linux, `RLIMIT_AS` of `memoryLimitMb` plus 768 MB of
headroom for the interpreter and libraries (skipped for the `torch` environment, which
reserves far more address space than it uses and relies on the sandbox's memory size);
on Linux under a dedicated sandbox user, a process-count limit.

**3. Run pytest** in a child process in its own session, with an environment holding only
`PATH` and fixed settings (no secrets can leak in), single-threaded BLAS, and
`PYTHONHASHSEED=0`. The whole run is killed at `wallClockLimitSeconds`. `conftest.py`:

- imports the submission once at session start, under one test's time limit, so its own
  errors (and a missing entry point) are reported as the learner's;
- applies a per-test alarm of `perTestTimeoutSeconds`; a test that exceeds it is recorded
  as `failed`, `timedOut: true`, message `"Time limit exceeded (N s)"`. The alarm raises a
  `BaseException`, so `except Exception` in a submission cannot swallow it;
- writes one JSON event per test to `events.jsonl`, which the harness reads afterwards;
  nothing is parsed from pytest's console output;
- derives `group` from the test file name.

> **Changed in M4.** Each test's printed output is captured in memory by `conftest.py`
> (`CappedOutput`, the first 4 KB kept and the rest counted and dropped), not by pytest's
> capture file. The file hit the 16 MB written-file limit, so printing 100 MB failed
> correct code with "File too large" (spec §10 expects it to complete).

**4. Write `result.json`** matching `RunResult`. A `MemoryError` in any test, or a child
killed by the kernel, yields `out_of_memory`; exceeding the wall clock yields `timeout`; a
test file that fails to load yields `harness_error`.

**Known limitation.** User code runs as the same user as the harness inside the sandbox, so
deliberately malicious code could try to forge `events.jsonl`. The import rules make this
awkward (`open`, `os`, `io` and `pathlib` are refused) but not impossible, for example
through a NumPy file writer. This affects only the submitter's own verdict, which is
accepted as out of scope like pasting a known solution (spec 11 §1). It does not weaken
isolation.

### What a failure reveals

|             | Public test                                                            | Hidden test                               |
| ----------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| Test name   | Yes                                                                    | Yes                                       |
| `message`   | Exception type and message, or the full assertion text, ≤ 500 chars    | Only the first line: the author's message |
| `traceback` | Frames in `solution.py` and the failing line of the test, ≤ 2000 chars | No                                        |
| `stdout`    | Yes, ≤ 4 KB per test                                                   | No                                        |

Hidden tests therefore show _which_ behaviour failed and the author's message, without
exposing test source or pytest's comparison detail. This is why spec 03 §5 asks for
learner-facing assertion messages.

Total `result.json` size is capped at 256 KB; captured output, then tracebacks, then
messages are replaced with a marker until it fits.

## 6. Stored result

`submissions.result` stores `{ tests, violations, errorOutput }` exactly as returned.
`tests_passed`, `tests_total` and `duration_ms` are copied to columns for cheap listing.

## 7. Verdict mapping

| `RunResult`                                         | `status`    | `verdict`               |
| --------------------------------------------------- | ----------- | ----------------------- |
| `completed`, every test `passed`, at least one test | `completed` | `passed`                |
| `completed`, any test `failed` or `error`           | `completed` | `failed`                |
| `completed`, all failures are per-test time limits  | `completed` | `time_limit_exceeded`   |
| `timeout`                                           | `completed` | `time_limit_exceeded`   |
| `out_of_memory`                                     | `completed` | `memory_limit_exceeded` |
| `import_violation`                                  | `completed` | `import_violation`      |
| `collection_error`                                  | `completed` | `runtime_error`         |
| `harness_error`, provider threw, or abort           | `error`     | `internal_error`        |
| `completed` with zero tests                         | `error`     | `internal_error`        |

Only `mode = submit` with verdict `passed` records progress.

## 8. Providers

### `LocalProvider` — development and CI only

Creates a temporary directory, writes the files, and runs the harness with `Bun.spawn`
using `RUNNER_PYTHON`, else the virtual environment from `bun run runner:setup`, else
`python3`. It passes only `PATH` to the harness and kills it 15 seconds after the wall clock. It gives no isolation and MUST refuse to construct when
`NODE_ENV` is `production`. It exists so that the full loop and `content:verify` work
without a sandbox account.

### `VercelSandboxProvider` — hosted default

Per run: create a sandbox from the prebuilt image for the requested environment, write
the files, run the harness, read `result.json`, and stop the sandbox in a `finally` block.

> **Built in M4, not yet run against Vercel.** `@vercel/sandbox` 3.9.1. Each sandbox is
> created with `networkPolicy: "deny-all"`, `persistent: false`, no environment
> variables, a vendor timeout of 75 s and one vCPU per 2 GB of memory needed. The images
> are the same `packages/runner/images/Dockerfile` the bundled runner uses, built for
> `linux/amd64` and pushed to the Vercel Container Registry (`bun run runner:images
--platform linux/amd64 --tag-prefix <registry>/ --push`). Authentication is the
> deployment's OIDC token, or `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` and `VERCEL_TOKEN`.
> E2B is not built.

### `HttpRunnerProvider` — self-hosted

Sends the `RunRequest` to the bundled runner service (`apps/runner`), which starts one
hardened Docker container per run and returns the `RunResult`. The service, its container
settings and its isolation levels are specified in spec 13 §5.

> **Built in M4.** `POST /v1/runs` with `Authorization: Bearer $RUNNER_TOKEN`; the body is
> validated with `runRequestSchema` (paths, run id, limits). The service drives the
> `docker` command, and the run's files reach the container on standard input, because
> its root filesystem is read-only and its working directory an empty tmpfs.

### Requirements on a provider serving the public

These are hard requirements for any instance open to strangers. A private instance used
by people its operator trusts may relax the first one (spec 13 §5).

| Requirement                                                                   | Reason                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Strong isolation per run: a microVM, or a container under a sandboxed runtime | Plain kernel-sharing containers are not enough for arbitrary code from strangers |
| **Outbound network disabled** for the run                                     | Otherwise the sandbox can be used to attack third parties                        |
| No environment variables or credentials inside                                | Nothing to steal                                                                 |
| Fresh filesystem per run, destroyed afterwards                                | No leakage between users                                                         |
| Hard timeout enforced by the vendor, independent of our harness               | A hung harness still ends                                                        |
| Prebuilt image or snapshot with dependencies installed                        | Installing packages per run is slow and needs network                            |

Verify network isolation with a test, not by reading documentation: a submission that
attempts an outbound connection MUST fail (§10).

### Images

Two images, built by a script from the pinned requirement files and referenced by
`RUNNER_IMAGE_NUMPY` and `RUNNER_IMAGE_TORCH`:

| Environment | Contents                        |
| ----------- | ------------------------------- |
| `numpy`     | Python 3.12+, NumPy, pytest     |
| `torch`     | The above plus CPU-only PyTorch |

`LocalProvider` and `content:verify` install from the same requirement files, so local,
CI and production agree on versions. Rebuilding an image is a deliberate change: rerun
`content:verify` against the new versions first.

## 9. Limits and cost control

| Limit                    | Value                                 | Enforced by                                                    |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------- |
| Code size                | 64 KB                                 | API validation                                                 |
| Per-test time            | Problem's `time_limit_seconds`        | `conftest.py`                                                  |
| Whole-run wall clock     | 60 s                                  | Harness, then provider timeout at 75 s, then API abort at 90 s |
| Memory                   | Problem's `memory_limit_mb`           | `RLIMIT_AS` and the sandbox's own size                         |
| Result size              | 256 KB                                | Harness                                                        |
| Concurrent runs per user | 1                                     | Unique index                                                   |
| Runs per user per minute | 10                                    | Rate limiter                                                   |
| Runs per user per day    | 100 by default, the same for everyone | Limit check                                                    |
| Global runs per day      | Configurable ceiling, default 20 000  | Counter; over it, `503 upstream_unavailable`                   |

Every value is an instance setting: `RUNS_PER_DAY`, `RUNS_PER_MINUTE` and
`GLOBAL_RUNS_PER_DAY`.

> **Changed in M4.** The daily default is 100, as `/v1/config` already published since
> M2; this table said 200. The variables keep M2's `RUNS_PER_DAY` naming instead of
> `LIMIT_*`. The daily count is of the user's submissions created since midnight UTC
> that did not end in `internal_error`; the global counter is incremented in the same
> transaction as the insert, so a refused run is never counted. Pipeline verification runs are counted
> against the ingestion, not against a user's daily limit.

The global ceiling is a spending circuit-breaker. When it trips, an alert is sent
(spec 11 §5).

## 10. Tests the runner must pass

A fixed set of adversarial submissions, run against the production provider in CI on a
schedule and before changing vendor or image:

| Submission                                                             | Expected                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Reference solution                                                     | `passed`                                                |
| Starter code                                                           | `failed`                                                |
| `while True: pass`                                                     | `time_limit_exceeded`, total time under 75 s            |
| Allocates 10 GB                                                        | `memory_limit_exceeded`                                 |
| `import torch` on a NumPy-only problem                                 | `import_violation` listing `torch`                      |
| `__import__("os").system("id")`                                        | `import_violation`                                      |
| Syntax error                                                           | `runtime_error` with the error text                     |
| Opens a socket to a public IP (scan bypassed deliberately in the test) | Connection fails                                        |
| Prints 100 MB                                                          | Completes; output truncated                             |
| Fork bomb                                                              | Contained; verdict is not `passed`; next run unaffected |
| Writes a file, then a second run looks for it                          | File absent                                             |
| Reads environment variables                                            | None of ours present                                    |

> **Built in M4.** `bun run runner:adversarial --provider http|vercel` runs these cases
> (`packages/runner/src/adversarial.ts`); the local provider is refused. The network,
> fork-bomb, file and environment cases put their attempt in the test file, which is not
> import-scanned. `.github/workflows/runner-adversarial.yml` runs it nightly and on runner
> changes against the bundled runner, and against Vercel Sandbox once its credentials
> are configured. Measured on the bundled runner: 12 of 12 as expected, in 71 s.

## 11. Out of scope

- Languages other than Python.
- GPU execution.
- Interactive sessions or a REPL.
- Warm sandbox pools. Add only if measured start-up time makes runs feel slow.
- A browser-side Python runtime. It would make tests visible and results untrustworthy.
