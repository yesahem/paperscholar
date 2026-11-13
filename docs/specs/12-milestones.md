# 12 — Milestones

Build order. Each milestone ends with something that works end to end and can be shown.
A milestone is done when its acceptance checks pass **and** lint, type-check, tests and
build are green.

```
M0 Foundation and open-source setup
 └─ M1 Content model + runner
     └─ M2 Read API + content pages
         └─ M3 Accounts and roles
             └─ M4 Submissions + sandbox + workspace     ← the product exists; self-hostable
                 └─ M5 Progress, profile, leaderboard
                     └─ M6 Paper pipeline                ← papers no longer hand-written
                         ├─ M7 Quiz, listings, feedback
                         ├─ M8 Courses
                         ├─ M9 Cold mail
                         └─ M10 Mock interview
```

M7–M10 are independent of each other and can be reordered or dropped. There is no billing
milestone: the project has no payments.

---

## M0 — Foundation and open-source setup

**Scope.** Turn the starter into this project's skeleton.

- Remove the demo page and demo components.
- Add `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`; a real
  `README.md`; stop ignoring `docs/`.
- Add Tailwind CSS 4 and the base `packages/ui` components.
- Create `apps/backend` with the Hono app, error envelope, request ID, health endpoint, and
  both entry files (serverless and `Bun.serve`).
- Create `packages/shared` and `packages/db` with a first migration.
- Add the `/api/*` rewrite in `apps/web`.
- Environment validation in both apps; `.env.example` files; `docker-compose.dev.yml`.
- CI: install, lint, type-check, test, build, secret scan.
- Deploy both apps; confirm the API runs on the Bun runtime.

**Acceptance.**

- `bun dev` starts web and API; `http://localhost:3000/api/health` returns the API's
  response through the proxy. The same works on a preview deployment.
- An unknown API route returns the error envelope with `not_found`.
- Starting either app with a missing required variable fails with a message naming it.
- The repository has a licence and no secrets.

**Specs.** 01, 02, 05 §1–3, 13 §2.

---

## M1 — Content model and runner

**Scope.**

- `packages/storage`: the `ObjectStorage` interface with the `r2` and `fs` drivers. Creating
  the real R2 buckets, token and CORS rule needs the maintainer's Cloudflare account; until
  then the `r2` driver is verified against an S3-compatible server with the same
  conditional-write behaviour.
- `packages/content`: schemas; the content store (object layout, immutable versions,
  index commit under a lock, read cache); file reader, `content:sync`, `content:export`.
- `content_candidates` table.
- `packages/runner`: types, `LocalProvider`, `harness.py`, `conftest.py`, environment
  requirement files, `helpers` support.
- `verifyProblem()` with checks V1–V6 and V10; `content:verify`, wired into CI.
- Three complete hand-written papers in `content/` (spec 03 §11).
- The private-content canary test.

**Acceptance.**

- `bun run content:verify` passes for all three papers, and `content:sync` uploads them to
  R2 and, with the other driver, to a local directory, producing identical keys.
- Breaking a solution, deleting a test file, or duplicating an ID fails with a message
  naming the problem.
- `content:export` of a synced paper reproduces its files.
- Running `content:sync` twice writes nothing the second time.
- Changing one problem and syncing writes a new version and updates the index; the old
  version's objects are untouched; pointing the index back restores the old content.
- Two simultaneous index writes both take effect (neither is lost).
- No content object can be fetched without credentials.
- The runner gives the expected outcome for starter, solution, infinite loop, banned
  import and syntax error using `LocalProvider`.

**Specs.** 03, 04 §4a, 07 §4–7, 13 §4.

---

## M2 — Read API and content pages

**Scope.**

- API: `GET /v1/papers`, `/v1/papers/:id`, `/v1/papers/:id/problems/:pid`, `/v1/tracks`,
  `/v1/config`.
- Web: landing, catalogue, paper page, problem page with description, tutorial and a
  working editor (no Run yet), roadmap, about and legal pages.
- Server-rendered, cached content pages; self-hosted editor assets; markdown and maths;
  draft autosave.
- Typed API client; Postman collection started.
- Security headers, CSP in report-only mode.

**Acceptance.**

- A problem page shows its description with JavaScript disabled.
- Changing a paper's status in `index.json` is reflected on the site within a minute,
  without a rebuild.
- Typing in the editor, reloading, and returning restores the text.
- The canary test passes against every endpoint added so far.
- The Postman collection passes against the preview API.

**Specs.** 05 §5, §8 (`/v1/config`), 08 §1–5.3, §7–11.

---

## M3 — Accounts and roles

**Scope.**

- Better Auth with email + password, optional Google, username plugin, verification and
  reset emails, database-backed rate limiting.
- Email drivers: `resend`, `smtp`, `log`.
- Roles `user`, `maintainer`, `admin`; `ADMIN_EMAILS`; `admin:grant`.
- Session middleware and the `require*` guards, including `requireRole` and
  `requireFeature`.
- `GET /v1/me`, `PATCH /v1/me`, `DELETE /v1/me`.
- Web: sign-in modal and auth pages, header account menu, verification banner.

**Acceptance.** Spec 06 §10, plus:

- Sign-up, verification, sign-out, sign-in, password reset and Google sign-in all work on
  a preview deployment.
- With no email driver and no Google credentials, sign-up and sign-in still work.
- Auth endpoints rate-limit after the configured number of attempts.

**Specs.** 06, 05 §7 (`/v1/me`).

---

## M4 — Submissions, sandbox, workspace

**Scope.** The core loop, on both deployment modes.

- `submissions` table; `POST /v1/submissions`, `GET /v1/submissions/:id`, history.
- Inline dispatcher with `waitUntil`; reaping; cleanup job.
- Hosted sandbox provider with both images.
- `apps/runner` and `HttpRunnerProvider`; `docker-compose.yml`; Dockerfiles.
- Rate limiter, daily limit, global ceiling.
- Web: Run and Submit, polling, Results tab, Submissions tab, all error states.
- Adversarial suite scheduled in CI against the hosted sandbox and the bundled runner.

**Acceptance.**

- On a preview deployment, the reference solution for each launch problem passes and the
  starter fails, with per-test results shown.
- Every row of spec 07 §10 produces its expected outcome on the hosted sandbox, and on
  the bundled runner.
- p95 time from click to verdict for a NumPy problem is under 8 seconds.
- Two simultaneous submissions from one user yield one `202` and one `409`.
- A run killed mid-flight leaves the user able to submit again within two minutes.
- **On a clean machine with only Docker, the quick start in spec 13 §6 produces a site
  where a new user can sign up, run code and get a verdict.**

**Specs.** 07, 05 §6, 08 §5.4–5.6, 04 §4, 11 §3, 13 §3–6.

---

## M5 — Progress, profile, leaderboard

**Scope.**

- `progress`, `paper_completions`, `user_stats`, `daily_activity`, `follows`, `profiles`.
- The full solve transaction; streaks.
- Endpoints in spec 05 §7.
- Avatar upload to the public bucket.
- Web: solved marks, progress bars, leaderboard, profile with heatmap, settings.

**Acceptance.**

- Passing a submit for the first time increments stats exactly once; passing again changes
  nothing but the day's submission count.
- Solving every problem of a paper records one completion.
- The leaderboard order matches a direct query over `progress`.
- Public profiles expose no email.
- Avatars work with the `fs` driver and with R2.

**Specs.** 04 §4–5, 05 §7, 08 §6.

---

## M6 — Paper pipeline

The milestone that replaces hand-written content. Build it in four slices; each is
demonstrable.

**6a — Engine.** `ingestions`, `ingestion_steps`, `pipeline_tasks`; the ingestion object
layout in storage;
`tick()`, leases, retries; the worker process and the internal tick endpoint; the
`LlmClient` adapter with its fake; `paper:ingest` and `paper:status`.

- _Acceptance:_ with the fake LLM, an ingestion goes from upload to `ready_for_review`.
  Killing the worker at any point and restarting it completes the run with no duplicated
  steps.

**6b — Read, plan, write.** The real `LlmClient` (Files API upload, prompt caching,
structured outputs, streaming, usage accounting); prompts for stages 1–3; suitability
check; arXiv intake; presigned PDF upload.

- _Acceptance:_ a real paper produces an outline with page-referenced chunks, a plan, and
  files for every step. Later calls in the run show cache reads. Uploading the same PDF
  twice returns the existing ingestion.

**6c — Verify and repair.** Checks V7 (mutants), V8 (independent solve), V9 (fidelity);
the repair loop; the ingestion report; token budget and limits.

- _Acceptance:_ every verified step passes V1–V10. A planted weak test is caught by V7. A
  planted omission in a description is caught by V8. A step that cannot be fixed in three
  attempts ends as `needs_attention` without stopping the others.

**6d — Review and publish.** Maintainer endpoints; the screens of spec 09 §17; candidate
editing with re-verification; waivers; publish and archive; `paper:publish`; the
"report a problem with this step" link; the eval script.

- _Acceptance:_ spec 09 §21 in full. In addition, a maintainer takes a paper they have
  never seen from PDF to published without writing a test, and a learner then solves its
  first step.

**Specs.** 09, 03 §2–3, 04 §6, 05 §8, 08 §2 and §6.

**Before opening uploads on a public instance:** run the eval (spec 09 §18) and record
the baseline.

---

## M7 — Quiz, listings, feedback

**Scope.** Spec 10 §1, §3, §4. Settle the listings data-source question first; if it is
not settled, ship quiz and feedback and leave listings off.

**Acceptance.**

- Quiz answers and explanations are absent from every response until an attempt is
  submitted.
- An attempt can be graded only once.
- Listings endpoints return `404` on an instance with no data, and enforce the daily row
  cap on one that has it.
- A step report filed from the workspace appears for maintainers with the paper and
  problem attached.

---

## M8 — Courses

**Scope.** Spec 10 §5.

**Acceptance.**

- Any signed-in user can play any lecture; a signed-out request gets `401`.
- The video URL stops working after expiry.
- Lecture progress and notes persist across devices.
- An instance with no course content shows no courses entry.

---

## M9 — Cold mail

**Scope.** Spec 10 §6.

**Acceptance.**

- Uploading a non-PDF, an oversized file, or a file with a PDF extension but different
  contents is rejected.
- A generation returns a subject and body matching the schema, and appears in history.
- A CV containing text such as "ignore your instructions and …" still yields an ordinary
  outreach email.
- A refused or truncated model response is reported as failed and does not count against
  the user's limit.
- Another user cannot read the CV or the generated mail.
- The feature is absent on an instance with no LLM key.

---

## M10 — Mock interview

**Scope.** Spec 10 §7. Text first (10a); voice (10b) only after 10a is accepted.

**Acceptance (10a).**

- The streaming check through the proxy is done and its result recorded.
- A full session runs to its time limit, is completed automatically, and produces feedback
  matching the schema.
- Token usage per session is recorded, and the second and later turns show cache reads.
- The per-user limit is enforced.

---

## Throughout

Every milestone also:

- adds or updates the Postman requests for endpoints it touches;
- adds tests per spec 11 §6;
- keeps the self-hosted stack working: a change that only works on the hosted deployment
  is not done;
- updates the spec when the implementation deliberately differs from it, in the same pull
  request.

## Suggested first week

1. Answer README questions 1–6. They affect M0 and M1.
2. M0 in full.
3. Start M1 with one hand-written problem, end to end, before writing the other papers.
   Those three papers define the quality bar the pipeline will later be measured against,
   so they are worth writing carefully.
