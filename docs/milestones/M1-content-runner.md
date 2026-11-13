# M1 — Content model and runner

**Status:** done locally, on branch `feat/m1-content-runner` (stacked on M0). Creating the
real Cloudflare R2 resources is pending (see [Not done](#not-done)).
**Spec:** [`docs/specs/12-milestones.md`](../specs/12-milestones.md) §M1.

## Summary

Papers now exist, live in object storage, and are proven correct by running them. Three
hand-written papers (nine problems) are in `content/`. `content:verify` runs every problem
through the Python harness and checks the reference solution passes, the starter fails,
imports follow the rules, and tests are fast, deterministic and hygienic. `content:sync`
publishes the library to storage as immutable versions behind one index, through either
the local-disk driver or the Cloudflare R2 driver. `content:export` writes a paper back to
files byte for byte.

## What was built

### `packages/storage` — object storage

One `ObjectStorage` interface (`get`, `getIfChanged`, `head`, `put` with
`ifMatch`/`ifNoneMatch`, `delete`, `list`) and two drivers:

- `fs`: a folder. Atomic writes (temporary file, then rename), create-once through hard
  links, cheap etags from size and nanosecond modification time.
- `r2`: any S3-compatible store, Cloudflare R2 in production. Requests are signed with
  `aws4fetch` and sent with `fetch`, so it runs on any host. Bun's own S3 client was not
  usable: it cannot send conditional-write headers.

Keys are validated so nothing can escape the storage root. One contract suite (10 tests)
runs against both drivers.

### `packages/runner` — running code

- `harness/harness.py`: scans imports with `ast` without running anything, then runs pytest
  in a child process with limits and a 60 s wall clock, and writes `result.json`. An
  `inspect` action parses files and reports their structure without running them.
- `harness/conftest.py`: one structured event per test (no parsing of pytest's console
  output), the per-test time limit, and the rule for what a failure reveals: hidden tests
  show only their name and the author's message.
- `LocalProvider`: runs the harness as a subprocess with only `PATH` in its environment.
  Refuses to start in production.
- `toVerdict()` (spec 07 §7), request builders, pinned environments (`numpy.txt`,
  `torch.txt`, Python 3.13), and `runner:setup`, which builds the local environment with uv.

### `packages/content` — the content model

- Schemas for `paper.yaml`, `problem.yaml`, tracks, and every stored object.
- `readContentLibrary()`: reads and validates `content/`, listing every problem with its
  file (missing files, unknown files, bad folder names, duplicate ids or order numbers,
  schema errors, raw HTML, unknown track papers).
- `ContentStore`: version documents written once (`ifNoneMatch: "*"`); `content/index.json`
  as the commit point, written under the index lock and conditionally on its etag; previous
  indexes kept in `index-history/`; orphaned version numbers from interrupted publishes
  skipped; a read cache that revalidates the index by etag; rollback by `setLiveVersion`.
- `syncLibrary()`: publishes only papers whose files changed, never touches papers made on
  the instance, keeps removed problems as `retired`, supports a dry run.
- `exportPaper()` and a canonical YAML writer, so export reproduces files exactly.

### `packages/pipeline` — verification

`verifyProblem()` with checks V1 (well-formed), V2 (solution passes), V3 (starter fails),
V4 (import policy), V5 (fast enough), V6 (deterministic) and V10 (test hygiene), and the
`content:verify` command. V7–V9 need a model and arrive with the pipeline in M6.

### `packages/db`

Migration `0001_content_candidates` and `createAdvisoryLock()`: a transaction-scoped
Postgres advisory lock, which works through poolers. Content writers use it so every
process agrees on who writes the index.

### Backend

`STORAGE_DRIVER`, `STORAGE_FS_PATH`, `R2_*` and `DATABASE_URL` in the validated
environment (the local-disk driver is refused on serverless hosting), and the commands
`content:sync` and `content:export`.

### Content

| Paper                                            | Problems                                                                             | Environment                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------- |
| Support-Vector Networks (Cortes & Vapnik, 1995)  | soft-margin objective, subgradient step, polynomial kernel, kernel decision function | NumPy                         |
| Attention Is All You Need (Vaswani et al., 2017) | positional encoding, scaled dot-product attention, multi-head attention              | NumPy                         |
| Adam (Kingma & Ba, 2015)                         | bias-corrected moment estimates, Adam step                                           | PyTorch, `torch.optim` banned |

Three problems (kernel decision function, multi-head attention, and the Adam step) build on
the previous step through `helpers`. The Adam step's hidden tests compare six steps against
PyTorch's own `torch.optim.Adam`. A `fundamentals` track lists all three papers.
`content/README.md` is the authoring guide.

### Tooling

- Dev compose: an S3-compatible server (`versity/versitygw:v1.11.0`) on port 54331, standing
  in for R2. It honours `If-Match`/`If-None-Match` exactly as R2 does.
- CI: Python environment via uv, the S3 server, `content:verify`; actions updated to
  current majors.
- Root commands: `runner:setup`, `content:verify`, `content:sync`, `content:export`.

## How to run

```sh
docker compose -f docker-compose.dev.yml up -d   # Postgres and the S3-compatible store
cp apps/backend/.env.example apps/backend/.env   # refresh: new storage and database settings
bun run db:migrate
bun run runner:setup                             # needs uv
bun run content:verify
bun run content:sync                             # into apps/backend/.storage
bun run content:export adam --content /tmp/out   # back to files
```

To use the S3 driver locally, set in `apps/backend/.env`: `STORAGE_DRIVER=r2`,
`R2_ENDPOINT=http://localhost:54331`, `R2_REGION=us-east-1`, `R2_ACCESS_KEY_ID=paperscholar`,
`R2_SECRET_ACCESS_KEY=paperscholar-dev-secret`, `R2_BUCKET=<name>`, and create the bucket
once (`S3Storage.createBucketIfMissing()`).

## Verification

All run locally on 2026-11-13, macOS, Bun 1.3.14, Python 3.13.7, NumPy 2.5.4, pytest 9.2.0,
PyTorch 2.15.0 (CPU).

| Check                                                  | Result                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run format:check`, `lint`, `check-types`, `build` | All pass                                                                                                                                  |
| `bun run test`                                         | 144 passed across 8 packages, none skipped: runner 28, backend 28, storage 26 (fs and S3), content 25, ui 13, shared 12, pipeline 9, db 3 |
| `bun run content:verify`                               | 9 of 9 problems pass every check, 8–10 s                                                                                                  |

Acceptance checks from spec 12 §M1:

| Check                                                                                                      | Evidence                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content:verify` passes for all three papers                                                               | `9 verified, 0 failed`                                                                                                                                                                                                                |
| `content:sync` uploads to R2 and to a local directory with identical keys                                  | Synced through both drivers (R2 driver against the S3-compatible server); the same 8 object keys                                                                                                                                      |
| A broken solution, a deleted test file, or a duplicated id fails, naming the problem                       | `✗ support-vector-networks/soft-margin-objective … V2 … 1/7 tests passed` (exit 1); `…/02-adam-step/tests/test_hidden.py: is missing` (exit 2); `…/04-positional-encoding: repeats the problem id of 01-positional-encoding` (exit 2) |
| `content:export` reproduces a synced paper's files                                                         | Exported files are byte-identical to the repository (`diff -r` clean)                                                                                                                                                                 |
| Running `content:sync` twice writes nothing the second time                                                | Second run: every paper `unchanged`; no object or index etag changed                                                                                                                                                                  |
| A change writes a new version; the old one is untouched; pointing back restores it                         | Changed paper became v2; v1's file unchanged; `setLiveVersion(1)` restored the old text                                                                                                                                               |
| Two simultaneous index writes both take effect                                                             | Unit test with two concurrent publishes; plus the advisory lock test across two separate database clients                                                                                                                             |
| No content object can be fetched without credentials                                                       | Unsigned GET of a private object: HTTP 403                                                                                                                                                                                            |
| The runner gives the expected outcome for starter, solution, infinite loop, banned import and syntax error | Covered by the runner suite, plus import-time loops, `__import__`/`open`, denylisted modules, missing entry points, broken test files, helpers, dotted bans, cancellation, PyTorch                                                    |

## Deviations from the specs

The specs were updated in this change to match.

| Spec said                                                              | Built                                                                                   | Why                                                                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `RunRequest` with flat limits and `mode`                               | `RunRequest { runId, environment, files, spec: HarnessSpec }`, plus an `inspect` action | V1 and V10 need to parse files in the sandbox without running them.                                                         |
| `TestResult` without a time-limit flag                                 | Added `timedOut`                                                                        | The verdict "all failures are per-test time limits" needs it.                                                               |
| Denylist of 17 modules; banned `__import__`, `eval`, `exec`, `compile` | Larger denylist; also `open`, `input`, `breakpoint` and interpreter-internals names     | Closes the obvious ways around the import rules and the results file.                                                       |
| `prohibited_imports` names modules                                     | Also submodule paths such as `torch.optim`                                              | The Adam problems must allow `torch` but not its optimisers.                                                                |
| `RLIMIT_AS = memoryLimitMb`                                            | `memoryLimitMb + 768 MB`, Linux only; process limit only under a sandbox user           | The interpreter, NumPy and pytest need address space of their own; per-user process limits would break a developer machine. |
| R2 driver details unspecified                                          | `aws4fetch` signing; optional `R2_ENDPOINT` and `R2_REGION`                             | Bun's S3 client cannot do conditional writes; other S3-compatible stores need an endpoint and a concrete region.            |
| `content_candidates.created_by` references `user`                      | No foreign key yet                                                                      | The `user` table arrives in M3, whose migration adds it.                                                                    |
| V10 also checks that hidden messages do not print arrays               | Left to reviewers                                                                       | Not decidable statically.                                                                                                   |
| `paper_refs` with equation numbers                                     | Section names for the SVM paper                                                         | I could not confirm that paper's equation numbering, so references name sections instead of risking wrong numbers.          |

## Things to know

- **Content licence.** The repository's MIT licence currently covers `content/`. Spec 13
  proposed CC BY-SA 4.0 for problem text and tests; that is still your decision (specs
  README, question 1).
- **Known limitation (documented in spec 07 §5):** malicious code could try to forge its own
  result file inside the sandbox. It cannot affect anyone else, and the import rules make it
  awkward; it is treated like pasting a known solution.
- **Local data.** `content:sync` writes to `apps/backend/.storage` by default; the dev compose
  file now has a second container (`objectstore`) and volume.

## Not done

| Item                                                      | Why                           | Next step                                                                                                                                                                             |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create the production R2 buckets, API token and CORS rule | Needs your Cloudflare account | Create a private bucket and a public one, an API token limited to them, and a CORS rule allowing `PUT` from the site's origin. Then set `STORAGE_DRIVER=r2` and the `R2_*` variables. |
| Run CI on GitHub                                          | Not pushed                    | Runs on the first push or pull request.                                                                                                                                               |

## Ready for M2

M2 (read API and content pages) builds on `ContentStore` (`getIndex`, `getPublicDoc`, which
already never touch private parts), the canary-tested public/private split, and `SITE`.
The canary test grows to cover every learner-facing endpoint there.
