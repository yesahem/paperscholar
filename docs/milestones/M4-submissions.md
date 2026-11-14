# M4 — Submissions, sandbox, workspace

**Status:** done locally and self-hosted, on branch `feat/m4-submissions` (stacked on M3).
The hosted half needs the maintainer's Vercel account and is pending: a preview
deployment, the sandbox images in Vercel's registry, and the adversarial suite against
Vercel Sandbox (see [Not done](#not-done)).
**Spec:** [`docs/specs/12-milestones.md`](../specs/12-milestones.md) §M4.

## Summary

The core loop exists. A signed-in learner presses **Run** (public tests) or **Submit**
(public and hidden tests) in the workspace, and the verdict appears in a Results tab
about a second later, with one row per test. Every run happens in a fresh, isolated
sandbox: a locked-down Docker container from the bundled runner when self-hosted, or a
Vercel Sandbox microVM on the hosted deployment. Runs are limited per user per minute and
per day, the instance has a daily ceiling, a lost run is cleared after two minutes, and a
daily job applies retention. `docker compose up -d` on a machine with only Docker gives a
working site.

## What was built

### API (`apps/backend`)

| Endpoint                               | What                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/submissions`             | `{ paperId, problemId, code, mode }` → `202 { id, status: "queued" }`; checks in the order of spec 05 §6 |
| `GET /api/v1/submissions/:id`          | Owner only. Status, verdict, per-test results; hidden tests never carry a traceback or output            |
| `GET /api/v1/submissions`              | The caller's history, newest first, filtered by paper, problem and mode, with an opaque cursor           |
| `GET\|POST /api/internal/cron/cleanup` | With `INTERNAL_SECRET`: reaps stale runs, deletes 30-day-old runs, day-old counters, expired sessions    |

- **`createSubmissions`** (`src/services/submissions.ts`): reaps the user's stale runs,
  checks the per-minute limit, then in one transaction counts today's runs, inserts the
  row (the `submissions_one_in_flight` index turns a second concurrent run into
  `409 submission_in_progress` naming the first) and increments the global counter. The
  run is dispatched with `runInBackground` (`waitUntil` on Vercel). `execute` claims the
  row, builds the request from the paper version recorded at creation, runs it with a
  90 s abort, maps the verdict (spec 07 §7) and stores the result. Any throw is
  `internal_error`.
- **Limits:** `RUNS_PER_MINUTE` (10), `RUNS_PER_DAY` (100, runs that failed on our side do
  not count), `GLOBAL_RUNS_PER_DAY` (20 000, then `503`), and `MUTATIONS_PER_MINUTE` (60
  writes per user across `/v1`). Every `429` carries `Retry-After`.
- **Providers** (`src/adapters/sandbox.ts`): `RUNNER_PROVIDER` is `local` (default outside
  production, refused in it), `http` or `vercel`; production must choose.
- **`src/worker.ts`** (`bun run worker`): the daily cleanup for self-hosted instances.
  `vercel.json` gains `maxDuration: 120` and a daily cron for the hosted one.
- **New variables**, each in `apps/backend/.env.example`: `RUNNER_PROVIDER`,
  `RUNNER_PYTHON`, `RUNNER_URL`, `RUNNER_TOKEN`, `RUNNER_IMAGE_NUMPY`, `RUNNER_IMAGE_TORCH`,
  `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`, `RUNS_PER_MINUTE`,
  `GLOBAL_RUNS_PER_DAY`, `MUTATIONS_PER_MINUTE`, `INTERNAL_SECRET`.

### Runner (`packages/runner`)

- **`HttpRunnerProvider`**: posts the request to the bundled runner with a bearer token;
  any refusal, timeout or malformed answer is a `SandboxProviderError`.
- **`VercelSandboxProvider`** (`@vercel/sandbox` 3.9.1): one microVM per run with
  `networkPolicy: "deny-all"`, `persistent: false`, no environment variables, a 75 s
  vendor timeout, stopped in `finally`. Not yet run against Vercel.
- **`runRequestSchema`**: a request received over the network is validated: file paths,
  reserved harness names, run id characters, limits.
- **Sandbox images** (`images/Dockerfile`, `bun run runner:images`): Python 3.13.18 with the
  pinned packages of one environment and a `sandbox` user (uid 10001). NumPy image
  311 MB, torch 1.38 GB.
- **Adversarial suite** (`src/adversarial.ts`, `bun run runner:adversarial --provider
http|vercel`): the twelve rows of spec 07 §10. It refuses the local provider.
- **Harness fix:** printed output is captured per test in memory, 4 KB kept (below).

### Bundled runner service (`apps/runner`, new)

A Bun HTTP service: `GET /health`, and `POST /v1/runs` with `Authorization: Bearer
$RUNNER_TOKEN`. Each run is `docker run --rm` with no network, a read-only root, 64 MB
tmpfs `/work` and `/tmp`, the problem's memory plus 1 GB and no swap, one CPU, 128
processes, no capabilities, no privilege escalation, user 10001 and no environment
variables. The files arrive on standard input (`src/bootstrap.py`); the result comes back
after a random marker line. The container is killed 15 s after the harness's 60 s and
force-removed afterwards. At most `RUNNER_MAX_CONCURRENT` (2) run at once and
`RUNNER_MAX_QUEUE` (20) wait. `RUNNER_DOCKER_RUNTIME=runsc` selects gVisor. Variables are in
`apps/runner/.env.example`.

### Self-hosting

- **`docker-compose.yml`**: `proxy` (Caddy 2.11.9, the only published service, on
  `HTTP_PORT`, default 8080), `web`, `backend` (migrations and `content:sync` on start,
  then serves), `worker`, `runner` (holds the Docker socket), `postgres`, and two
  build-only services that build and check the sandbox images. Four networks keep each
  service to what it needs; `web` cannot resolve `runner`.
- **`deploy/Caddyfile`**: replaces any client-sent `X-Forwarded-For`, closing the M3 gap
  where clients could choose their own address. Automatic HTTPS when `SITE_ADDRESS` is a
  domain.
- **Dockerfiles** in `apps/backend`, `apps/runner` and `apps/web`, built from the repository
  root (`.dockerignore` keeps local files, secrets and `node_modules` out).
- **Root `.env.example`**: `WEB_ORIGIN` and three secrets required; compose names any that
  is missing. Everything optional is listed and off by default.

### Database (`packages/db`)

- Migration `0004_submissions.sql`: `submissions` as in spec 04 §4, with `CHECK`s from the
  shared vocabulary and the partial indexes `submissions_one_in_flight` and
  `submissions_in_flight_age`, plus `submissions_run_mode_age` for retention.

### Shared (`packages/shared`)

- `@repo/shared/submissions` (no zod, for the browser): modes, statuses, verdicts, limits,
  `utf8ByteLength`. `http/submissions.ts`: the request and response schemas.
- `@repo/shared/logger`: the JSON logger, moved from the backend so the runner service
  uses the same one.

### UI (`packages/ui`)

- `Toast` (`ToastProvider`, `useToast`), `ResizablePanels` (window-splitter pattern:
  arrows, Home and End, pointer drag; stacks below 900 px), `Meter`. Pure logic in
  `lib/toast.ts` and `lib/resizable.ts`, tested.

### Web (`apps/web`)

- **Workspace:** Run and Submit buttons, `Ctrl/⌘ + Enter` and `Ctrl/⌘ + Shift + Enter` in
  Monaco and in the fallback text box, a resizable divider, and two new tabs:
  - **Results** shows each verdict of spec 08 §5.5. Passed submits say "Solved" and link
    to the next step. Failures show the pass count, a bar and expandable rows (message;
    for public tests also traceback and output). Time limits name the slow tests or
    "the whole run". Import violations list the modules and the allowed packages.
    Runtime errors show the error text. Our own errors say the run was not counted.
  - **Submissions** lists this problem's history and restores any run's code into the
    editor.
- **Error states** (spec 08 §5.4): signed out opens the sign-in modal with the draft
  untouched; `403 email_not_verified` shows the resend banner; `409` follows the running
  submission; `429` shows a toast saying when to retry; network and `5xx` errors show an
  inline retry. Polling is every second for ten seconds, then every two, giving up at 120
  seconds with "Check again".
- The privacy page now says that run and submitted code is stored (runs for 30 days).

### Tooling

- `.github/workflows/runner-adversarial.yml`: nightly, by hand, and on runner changes.
  It builds the images, starts the runner service and runs the suite. A second job runs
  it against Vercel Sandbox once `VERCEL_*` secrets and `RUNNER_IMAGE_*` variables exist;
  until then it skips with a notice.
- CI's contract step runs with email verification off, so the Postman collection follows
  a real run to its verdict (local provider).
- `content:verify --provider http` checks every problem on the bundled runner.
- Postman: a `submissions` folder (signed-out 401, a run followed to its verdict, history,
  400, 404; on a verifying instance, the 403).

## How to run it

```sh
# Self-hosted, with only Docker
cp .env.example .env            # set BETTER_AUTH_SECRET, RUNNER_TOKEN, POSTGRES_PASSWORD
docker compose up -d            # http://localhost:8080

# Development (local provider, no isolation)
bun dev

# Development with the Docker sandbox
bun run runner:images
RUNNER_TOKEN=… bun run --cwd apps/runner start
# apps/backend/.env: RUNNER_PROVIDER=http RUNNER_URL=http://localhost:8798 RUNNER_TOKEN=…

# Checks
RUNNER_URL=http://localhost:8798 RUNNER_TOKEN=… bun run runner:adversarial --provider http
RUNNER_URL=http://localhost:8798 RUNNER_TOKEN=… bun run content:verify --provider http
```

## Verification

All on macOS (arm64) with Docker Desktop 29.9.2, against a real Postgres.

| Check                                                  | Result                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `format:check`, `lint` (10 workspaces), `check-types`  | Pass                                                                                                                                                                                 |
| `bun run test`                                         | 404 tests pass: backend 150, `@repo/runner` 43, web 49, shared 42, content 36, storage 26, ui 24, runner service 20, pipeline 9, db 5                                                |
| Backend tests under `TZ=Asia/Kolkata`                  | 150 pass                                                                                                                                                                             |
| `bun run build`, `content:verify` (local)              | Pass; 9 of 9 problems                                                                                                                                                                |
| `content:verify --provider http` (bundled runner)      | 9 of 9: each reference solution passes and each starter fails, NumPy and PyTorch                                                                                                     |
| Adversarial suite, runner service on the host          | 12 of 12 as expected, 71 s                                                                                                                                                           |
| Adversarial suite, runner in the compose stack         | 12 of 12 as expected, 71 s                                                                                                                                                           |
| Postman contract, verification off                     | 30 requests, 111 assertions, 0 failed                                                                                                                                                |
| Postman contract, verification on                      | 25 requests, 94 assertions, 0 failed                                                                                                                                                 |
| Browser: workspace flows on a production build (16)    | 16 of 16: signed-out modal, Run, Submit shortcut, Solved and next link, failures, import violation, syntax error, history, restore, no failed requests or console errors             |
| Browser: M3 account flows (regression)                 | 24 of 24                                                                                                                                                                             |
| Click to verdict, NumPy, 20 runs on the bundled runner | p50 1 040 ms, p95 1 047 ms (target under 8 s). The first poll is at 1 s, so about a second is the floor                                                                              |
| Two simultaneous submissions                           | One `202`, one `409` naming the first (integration test, real Postgres)                                                                                                              |
| Backend killed mid-run (compose)                       | The run became `internal_error`; a new submission was accepted 123 s after the kill (reaped at 120 s after creation, checked every 5 s)                                              |
| Quick start from a fresh copy of the repository        | `docker compose up -d` built and started everything in about 6 minutes; a new user signed up, ran a NumPy problem (1.1 s) and submitted a PyTorch one (2.0 s); 5 of 5 browser checks |
| Runner reachable from outside?                         | No: no published port; from `web`, `runner` does not resolve; from `backend` it answers                                                                                              |
| Forged `X-Forwarded-For` behind Caddy                  | Twelve failed sign-ins with twelve forged addresses: refused from the eleventh                                                                                                       |
| JavaScript per page (gzipped script chunks)            | Content pages 222–225 KB (M3: 220–224); the workspace 233 KB before Monaco loads                                                                                                     |

## Bugs found and fixed

- **Printing a lot failed correct code.** pytest captured output to a temporary file,
  which hit the harness's 16 MB written-file limit, so a solution printing 100 MB failed
  with "File too large". Output is now captured in memory, 4 KB kept and the rest
  counted. `local-provider.test.ts` fails without the fix.
- **Unconfirmed users hit 403s on every workspace load.** The Submissions tab asked for
  history, which needs a confirmed email, and retried. It now waits for a confirmed
  email and never retries a `4xx`. Found in the browser run.
- **The backend image could not write to its storage volume** (root-owned new volume,
  non-root process). The image now creates `/data/storage` owned by its user. Found by the
  quick start.

## Deviations from the specs

All are reflected in the specs in this change.

1. **Daily limit default 100, variable names kept (07 §9, 02).** Spec 07 said 200 while
   `/v1/config` had published 100 since M2; 100 stays. Limits are `RUNS_PER_DAY`,
   `RUNS_PER_MINUTE`, `GLOBAL_RUNS_PER_DAY` and `MUTATIONS_PER_MINUTE`, not `LIMIT_*`.
   The runner's secret is `RUNNER_TOKEN`, not `RUNNER_SECRET`.
2. **A `proxy` service (13 §3).** Caddy in front of `web` is now the only published
   service, because `next start` does not set the client address (M3 finding).
3. **Files over standard input (13 §5).** The bundled runner drives the `docker` command
   and sends files on stdin, since the container's root is read-only and its working
   directory an empty tmpfs.
4. **Vercel images from its container registry (07 §8).** The hosted sandbox boots the same
   Dockerfile's image pushed to VCR, instead of a vendor snapshot, so both modes run one
   image definition.
5. **Captured output in memory (07 §5).** See the first bug above.
6. **Cleanup also by GET (05 §10)**, because Vercel Cron sends GET.
7. **Dockerfiles live beside their apps (02)** instead of in a `docker/` folder, and the
   proxy's configuration is `deploy/Caddyfile`.
8. **The logger is `@repo/shared/logger`** (it was `apps/backend/src/lib/logger.ts`) so
   the runner service shares it.

## Things to know

- **Plain Docker is not a boundary for strangers.** The default runtime shares the host
  kernel; the README, compose file and runner README say so. gVisor (`runsc`) was not
  tested here: Docker Desktop on macOS does not ship it.
- **The runner holds the Docker socket**, which is root on the host. It has no port and
  sits on a network only `backend` and `worker` join.
- **The public-read limit (300 per minute per address, spec 11 §3) is not built.** It
  would add a database write to every content request, which spec 05 §5 keeps free of the
  database. This is a decision for you: drop it, or count reads elsewhere.
- **Right after `docker compose up`, the catalogue is empty for about 30 seconds.** The page
  was prerendered at build time, before the API existed, and refreshes on its first visit
  after the revalidation window.
- **A fork bomb holds a runner slot for the full 60 s.** With two slots, two at once
  delay everyone else on a small instance until they end.
- **The quick start reused base images already pulled** on this machine (Bun, Node,
  Python, Docker CLI, Caddy, Postgres); everything of this project's was built from
  scratch. Images are large: web 1.72 GB, runner 1.3 GB, backend 1.24 GB, because each installs the
  whole workspace's dependencies (the web image has no standalone output). Trimming them
  is worth doing before a release.
- **The browser checks** ran from outside the repository with `puppeteer-core` and the
  local Chrome, as in M2 and M3. Playwright in the repository (spec 11 §6) is still to
  do.
- **Alerts** (spec 11 §5): the ceiling, stale reaps and our own errors are logged as
  `error` or `warn` lines with fixed messages; no alerting system is wired up.

## Not done

- **Preview deployment:** the acceptance rows "on a preview deployment, the reference
  passes and the starter fails" and "every row of spec 07 §10 on the hosted sandbox"
  need the images pushed to Vercel's registry and Vercel credentials. The provider is
  written and unit-tested against a fake; it has never talked to Vercel.
- **E2B provider and `QueueDispatcher`** (spec 07 §2, §3): not needed yet.
- **Solved marks and progress** after a passed submit: M5.
- **"Report a problem" as an in-app bug report** (spec 08 §5.6): still a link to a GitHub
  issue until feedback arrives in M7.
- Still pending from earlier milestones: the real R2 buckets, token and CORS rule;
  preview checks of M0–M3; Google sign-in end to end.

## Ready for M5

`execute()` is where the solve transaction of spec 04 §5.1 goes: after `toVerdict`, a
`passed` submit-mode result records progress in the same update. The Results tab's
"Solved" state is where the `progress` query gets invalidated.
