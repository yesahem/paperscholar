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

```ts
type RunFile = { path: string; content: string };

type RunRequest = {
  submissionId: string;
  environment: "numpy" | "torch";
  mode: "run" | "submit";
  files: RunFile[]; // solution.py, tests, harness.py, conftest.py, spec.json
  perTestTimeoutSeconds: number;
  memoryLimitMb: number;
  wallClockLimitSeconds: number; // hard cap for the whole run: 60
};

type RunResult = {
  outcome:
    | "completed" // pytest ran to the end
    | "import_violation"
    | "collection_error" // solution failed to import: syntax error, missing entry point
    | "timeout" // whole-run wall clock exceeded
    | "out_of_memory"
    | "harness_error"; // our fault
  tests: {
    name: string;
    group: "public" | "hidden";
    status: "passed" | "failed" | "error";
    durationMs: number;
    message: string | null;
    traceback: string | null;
    stdout: string | null;
  }[];
  violations: string[]; // module names, for import_violation
  errorOutput: string | null; // for collection_error
  durationMs: number;
};

interface SandboxProvider {
  readonly name: string;
  run(request: RunRequest, signal: AbortSignal): Promise<RunResult>;
}
```

Files written into the sandbox working directory:

| File                        | Source                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `solution.py`               | The user's code, verbatim                                     |
| `tests/test_public.py`      | The paper's `private.json`                                    |
| `tests/test_hidden.py`      | The paper's `private.json` — **only when `mode` is `submit`** |
| `helpers.py`                | The paper's `private.json`, when the problem has helpers      |
| `conftest.py`, `harness.py` | `packages/runner/harness/`                                    |
| `spec.json`                 | `entryPoint`, `allowedPackages`, `prohibitedImports`, limits  |

For a learner's submission, the reference solution is never sent to the sandbox. When the
pipeline or `content:verify` checks a problem, the code under test (the reference
solution, the starter, a mutant, or an independent solver's answer) is written as
`solution.py` in exactly the same way.

## 5. The harness

`harness.py` is the single command the provider runs. It writes `result.json`, which the
provider reads back. It does four things in order.

**1. Import scan.** Parse `solution.py` with Python's `ast` module, without executing it.
Collect the top-level module of every `import` and `from … import`. The run ends with
`import_violation` if any module is:

- in the problem's `prohibited_imports`; or
- in the global denylist: `os`, `sys`, `subprocess`, `socket`, `ctypes`, `multiprocessing`,
  `threading`, `importlib`, `shutil`, `pathlib`, `signal`, `resource`, `pickle`,
  `urllib`, `http`, `requests`, `inspect`; or
- neither in the Python standard library nor in `allowed_packages`. `helpers` is allowed
  when the problem provides it. `inspect` is on the denylist, so helper source cannot be
  printed.

Calls to `__import__`, `eval`, `exec` and `compile` by name are also reported. A syntax
error at this stage ends the run with `collection_error`.

**2. Resource limits.** Before starting the test process, set `RLIMIT_AS` to
`memoryLimitMb`, cap the number of processes, and cap the size of any file written.

**3. Run pytest** in a child process:
`python -m pytest tests -p no:cacheprovider -q`, with a wall-clock limit of
`wallClockLimitSeconds`. `conftest.py`:

- applies a per-test alarm of `perTestTimeoutSeconds`; a test that exceeds it is recorded
  as `failed` with message `"Time limit exceeded (N s)"`;
- records each test's outcome, duration, captured stdout and failure text;
- derives `group` from the test file name.

**4. Write `result.json`** matching `RunResult`. A `MemoryError` raised in any test, or a
child killed for memory, yields `out_of_memory`; exceeding the wall clock yields `timeout`.

Address-space limits are unreliable for PyTorch, which reserves far more virtual memory
than it uses. For the `torch` environment, skip `RLIMIT_AS` and rely on the sandbox's own
memory size, chosen as the smallest size at or above `memoryLimitMb`.

### What a failure reveals

|             | Public test                                                            | Hidden test |
| ----------- | ---------------------------------------------------------------------- | ----------- |
| Test name   | Yes                                                                    | Yes         |
| `message`   | Exception type and message, ≤ 500 characters                           | Same        |
| `traceback` | Yes, limited to frames in `solution.py` and the failing assertion line | No          |
| `stdout`    | Yes, ≤ 4 KB per test                                                   | No          |

Hidden tests therefore show _which_ behaviour failed and the author's message, without
exposing test source. This is why spec 03 §5 asks for learner-facing assertion messages.

Total `result.json` size is capped at 256 KB; excess test output is truncated with a
marker.

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
using the developer's Python. It gives no isolation and MUST refuse to construct when
`NODE_ENV` is `production`. It exists so that the full loop and `content:verify` work
without a sandbox account.

### `VercelSandboxProvider` — hosted default

Per run: create a sandbox from the prebuilt image for the requested environment, write
the files, run the harness, read `result.json`, and stop the sandbox in a `finally` block.

### `HttpRunnerProvider` — self-hosted

Sends the `RunRequest` to the bundled runner service (`apps/runner`), which starts one
hardened Docker container per run and returns the `RunResult`. The service, its container
settings and its isolation levels are specified in spec 13 §5.

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

| Limit                    | Value                                | Enforced by                                                    |
| ------------------------ | ------------------------------------ | -------------------------------------------------------------- |
| Code size                | 64 KB                                | API validation                                                 |
| Per-test time            | Problem's `time_limit_seconds`       | `conftest.py`                                                  |
| Whole-run wall clock     | 60 s                                 | Harness, then provider timeout at 75 s, then API abort at 90 s |
| Memory                   | Problem's `memory_limit_mb`          | `RLIMIT_AS` and the sandbox's own size                         |
| Result size              | 256 KB                               | Harness                                                        |
| Concurrent runs per user | 1                                    | Unique index                                                   |
| Runs per user per minute | 10                                   | Rate limiter                                                   |
| Runs per user per day    | 200, the same for everyone           | Limit check                                                    |
| Global runs per day      | Configurable ceiling, default 20 000 | Counter; over it, `503 upstream_unavailable`                   |

Every value is an instance setting (`LIMIT_*`). Pipeline verification runs are counted
against the ingestion, not against a user's daily limit.

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

## 11. Out of scope

- Languages other than Python.
- GPU execution.
- Interactive sessions or a REPL.
- Warm sandbox pools. Add only if measured start-up time makes runs feel slow.
- A browser-side Python runtime. It would make tests visible and results untrustworthy.
