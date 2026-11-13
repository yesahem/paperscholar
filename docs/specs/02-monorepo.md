# 02 — Monorepo

## 1. Starting point and current state

The maintainer's `init` commit (2026-11-13) was a Turborepo starter: `apps/web` (Next.js
16.3.8 demo page), `apps/backend` (a `bun init` app with Hono), `packages/ui` (three demo
components), and the shared ESLint and TypeScript presets. `apps/docs` had already been
removed and an MIT `LICENSE` added.

M0 turned that into the foundation described below. What exists now, and what each
milestone added, is recorded in `docs/milestones/`. Internal packages use the `@repo/*`
scope and are referenced with `"*"` versions.

## 2. Target layout

```
apps/
  web/                     Next.js frontend, including the maintainer screens
  api/                     Hono backend and the pipeline worker entry (new)
  runner/                  Docker-based sandbox service, self-hosting only (new)
packages/
  shared/                  zod schemas, enums, constants (new)
  db/                      Drizzle schema, client, migrations (new)
  content/                 content schemas; read/write in storage; sync and export (new)
  storage/                 ObjectStorage interface, `r2` and `fs` drivers (new)
  runner/                  sandbox providers and the Python harness (new)
  pipeline/                paper pipeline: stages, prompts, checks (new)
  ui/                      shared React components (replace demo contents)
  eslint-config/           keep
  typescript-config/       keep; add a `bun.json` preset
content/                   the shared library of papers, tracks, quizzes (new)
postman/                   API collection and environments (new, from M2)
docker/                    Dockerfiles (new)
docker-compose.yml         self-hosting stack (new)
docker-compose.dev.yml     Postgres and storage for development (new)
docs/                      how-it-works.md, specs/, user guides
.github/workflows/         CI (new)
LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md   (new)
```

## 3. Changes to the starter

1. Delete `apps/docs`. (Done by the maintainer before M0.)
2. Replace the demo page, CSS modules and demo `packages/ui` components.
3. Add Tailwind CSS 4 to `apps/web` and `packages/ui`.
4. Add the new apps and packages below.
5. Add `dist/**` to the `build` task outputs and add `test` and `content:verify` tasks in
   `turbo.json`. **Before editing `turbo.json`, read the Turborepo docs bundled with the
   installed version**, as `AGENTS.md` requires.
6. Replace the starter `README.md`; add the licence and community files (spec 13 §2).
7. Leave the managed block in `AGENTS.md` untouched; add project rules below it.
8. Stop ignoring `docs/` in `.gitignore` (README Q2).

## 4. Packages

### `apps/backend`

|                  |                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Purpose          | The HTTP API, and the entry point for background work                                                                              |
| Runtime          | Bun                                                                                                                                |
| Key dependencies | `hono`, `@hono/zod-validator`, `zod`, `better-auth`, `@repo/db`, `@repo/shared`, `@repo/content`, `@repo/runner`, `@repo/pipeline` |
| Exports          | `./client` — type-only export of the route types for the typed client                                                              |
| Scripts          | `dev`, `start`, `worker`, `build`, `test`, `check-types`, `lint`                                                                   |

Serverless hosts auto-detect entry files named `app`, `index` or `server`, so only the
serverless entry uses one of those names.

```
apps/backend/
  src/
    index.ts               serverless entry: default-exports the Hono app
    main.ts                Bun.serve entry: local development and self-hosting
    worker.ts              long-running loop that calls the pipeline's tick()
    create-app.ts          builds the app: middleware + route mounting
    env.ts                 zod-validated environment (the only reader of process.env)
    types.ts               Hono environment type shared by routes and middleware
    features.ts            computes which features are enabled (spec 13 §4)
    routes/                one file per resource; routes/admin/ for maintainer routes
    services/              business logic, one module per domain
    middleware/            request context, logging, cache policy, body limit, errors;
                           later session, requireAuth, requireRole, rateLimit
    adapters/              email, llm, background (waitUntil), speech
    cli/                   content:sync, content:export, paper:*, admin:grant
    lib/                   AppError, JSON logger, validate() for request input
  test/                    bun tests using app.request()
  vercel.json              bunVersion, function maxDuration, schedules
```

Rules:

- Route files validate input, call a service, and shape the response. No SQL in routes.
- Services take their dependencies (db, adapters, clock) as arguments so tests can pass
  fakes.
- Only `adapters/` and the entry files may use Bun-specific or host-specific APIs
  (01 §7).
- Each adapter has a real implementation and a fake. The LLM fake returns canned
  structured outputs, so the pipeline can be tested without spending money.

### `apps/web`

|                  |                                                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose          | Pages, the editor, maintainer screens, the `/api/*` proxy                                                                                                                                                                     |
| Key dependencies | `next`, `react`, `tailwindcss`, `@monaco-editor/react`, `@tanstack/react-query`, `react-markdown`, `remark-math`, `remark-gfm`, `rehype-katex`, `better-auth` (client only), `hono` (client only), `@repo/ui`, `@repo/shared` |
| Scripts          | existing, plus `test:e2e` (Playwright)                                                                                                                                                                                        |

### `apps/runner`

A small Bun HTTP service that implements sandbox runs with Docker. Used only when
self-hosting (spec 13 §5). Depends on `@repo/runner`. Not deployed on the hosted instance.

### `packages/shared`

Zod schemas for every request and response body, the enums in §7, default limits, and the
controlled tag list. No runtime dependencies other than `zod`. Must be importable in the
browser.

### `packages/db`

Drizzle schema, the database client factory, generated migrations, and a seed script.
Exports `createDb(url)` and the schema. Scripts: `db:generate`, `db:migrate`, `db:seed`,
`db:studio`.

### `packages/content`

Zod schemas for papers, problems and tracks; the content store (reading the index and
versioned objects through a cache, writing versions, committing the index); a reader that
parses `content/`; `sync` (files → storage) and `export` (storage → files). Spec 03.

### `packages/storage`

The `ObjectStorage` interface and its two drivers: `r2` (Cloudflare R2 through the
S3-compatible API) and `fs` (a directory). Used for paper content, pipeline working
files, PDFs, avatars, CVs and video. It knows keys and bytes, nothing about papers.
The S3 client is imported in exactly one file.

### `packages/runner`

The `SandboxProvider` interface, its implementations, and the Python harness files
(spec 07). Depends on `@repo/shared` only.

### `packages/pipeline`

The paper pipeline (spec 09): task handlers for each stage, `tick()`, the prompt files,
`verifyProblem()` and the individual checks, and the eval script. It receives its
database, sandbox provider, storage and `LlmClient` as arguments and imports no vendor SDK
itself.

### `packages/ui`

Design-system components built on Radix primitives in the shadcn style, styled with
Tailwind. No data fetching and no app-specific logic.

## 5. Dependency rules

```
apps/web    ──▶ ui, shared, api (types only)
apps/backend    ──▶ shared, db, storage, content, runner, pipeline
apps/runner ──▶ runner, shared
pipeline    ──▶ shared, db, storage, content, runner
content     ──▶ shared, storage
storage     ──▶ (nothing internal)
runner      ──▶ shared
db, shared  ──▶ (nothing internal)
```

Enforced by ESLint `no-restricted-imports`:

- `apps/web` and `packages/ui` MUST NOT import `@repo/db`, `@repo/storage`,
  `@repo/content`, `@repo/runner` or `@repo/pipeline`.
- `apps/web` may import from `backend` with `import type` only.
- The Anthropic SDK is imported in exactly one file, the `LlmClient` adapter.
- No package imports from an app, except that type-only import.

## 6. Tasks

| Command (root)                                     | Does                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `bun dev`                                          | web on 3000 and backend on 8797                                                    |
| `bun run worker`                                   | The pipeline worker loop (not needed for `bun dev` unless working on the pipeline) |
| `bun run build`                                    | Builds packages, then the apps                                                     |
| `bun run lint` / `check-types` / `format`          | As in the starter                                                                  |
| `bun run test`                                     | `bun test` in api and packages                                                     |
| `bun run db:migrate` / `db:seed`                   | Migrations and seed data                                                           |
| `bun run content:verify`                           | Checks every paper in `content/` (needs Python)                                    |
| `bun run content:sync`                             | Uploads `content/` to storage                                                      |
| `bun run content:export <paper-id>`                | Downloads a paper from storage to `content/`                                       |
| `bun run paper:ingest <pdf \| arxiv:ID>`           | Starts the pipeline for a paper                                                    |
| `bun run paper:status <id>` / `paper:publish <id>` | Pipeline status and publishing from the command line                               |
| `bun run admin:grant <email> <role>`               | Sets a user's role                                                                 |
| `bun run pipeline:eval`                            | Runs the pipeline quality eval (spends LLM credit; run by hand)                    |

## 7. Shared enums

Defined once in `packages/shared` and used everywhere.

| Enum               | Values                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `Role`             | `user`, `maintainer`, `admin`                                                                                              |
| `Difficulty`       | `easy`, `medium`, `hard`                                                                                                   |
| `ProblemType`      | `micro`, `model`                                                                                                           |
| `RunEnvironment`   | `numpy`, `torch`                                                                                                           |
| `ContentStatus`    | `draft`, `published`, `archived` (papers) / `retired` (problems)                                                           |
| `ContentSource`    | `repo`, `pipeline`, `manual`                                                                                               |
| `SubmissionMode`   | `run`, `submit`                                                                                                            |
| `SubmissionStatus` | `queued`, `running`, `completed`, `error`                                                                                  |
| `Verdict`          | `passed`, `failed`, `time_limit_exceeded`, `memory_limit_exceeded`, `import_violation`, `runtime_error`, `internal_error`  |
| `IngestionStatus`  | `queued`, `reading`, `planning`, `awaiting_plan_review`, `writing`, `ready_for_review`, `published`, `failed`, `cancelled` |
| `StepStatus`       | `pending`, `writing`, `verifying`, `verified`, `edited`, `needs_attention`                                                 |

There is no tier or plan enum.

## 8. Environment variables

Each app has an `env.ts` that parses `process.env` with zod at start-up and fails fast
with a readable message. Nothing else reads `process.env`. Committed `.env.example` files
list every variable with a comment.

### `apps/backend` — required

Each becomes required at the milestone that first uses it. M0 requires only `WEB_ORIGIN`.

| Variable                                                                                                      | Purpose                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                | Postgres connection string (the pooler, when hosted)                                      |
| `WEB_ORIGIN`                                                                                                  | Public site origin, e.g. `https://example.com`                                            |
| `BETTER_AUTH_SECRET`                                                                                          | Session signing secret                                                                    |
| `RUNNER_PROVIDER`                                                                                             | `local`, `http` (bundled runner), `vercel` or `e2b`                                       |
| `INTERNAL_SECRET`                                                                                             | Authenticates scheduled and internal calls                                                |
| `STORAGE_DRIVER`                                                                                              | `r2` or `fs`. Where all paper content lives. `r2` is required on serverless hosting.      |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_URL` | With `r2`: credentials, the private bucket, and the public bucket and its URL for avatars |
| `STORAGE_FS_PATH`                                                                                             | With `fs`: the directory to use                                                           |

### `apps/backend` — optional; each enables features (spec 13 §4)

| Variable                                                                  | Enables                                   |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| `DATABASE_URL_DIRECT`                                                     | Used only by migrations and seeds         |
| `ANTHROPIC_API_KEY`, `LLM_MODEL`                                          | Paper pipeline, cold mail, mock interview |
| `EMAIL_DRIVER` (`resend`, `smtp` or `log`), its credentials, `EMAIL_FROM` | Verification and reset emails             |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                | Google sign-in                            |
| `RUNNER_URL`, `RUNNER_SECRET`                                             | The bundled runner (`http` provider)      |
| `RUNNER_IMAGE_NUMPY`, `RUNNER_IMAGE_TORCH`, vendor credentials            | A managed sandbox vendor                  |
| `ADMIN_EMAILS`                                                            | Addresses made `admin` at sign-up         |
| `REQUIRE_EMAIL_VERIFICATION`, `ALLOW_SIGNUPS`, `FEATURE_*`                | Explicit switches                         |
| `LIMIT_*`, `PIPELINE_*`                                                   | Overrides for limits (11 §3, 09 §18)      |

### `apps/web`

| Variable               | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `API_ORIGIN`           | Where `/api/*` is proxied to. Server-side only. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for metadata and links       |

The web app has no secrets. Any variable prefixed `NEXT_PUBLIC_` is public by definition.

## 9. Tooling

| Tool              | Version in repo / to add     | Notes                                                                                                           |
| ----------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Bun               | 1.3.14                       | Package manager, API runtime, test runner                                                                       |
| Node              | ≥ 24                         | Still needed by Next.js tooling                                                                                 |
| TypeScript        | 7.0.2                        | Confirm each new tool supports TS 7 when adding it                                                              |
| Next.js / React   | 16.3.8 / 19.2.8              |                                                                                                                 |
| Turborepo         | ^2.11                        | Read bundled docs before config changes                                                                         |
| Hono              | 4.x                          |                                                                                                                 |
| Zod               | 4.x                          |                                                                                                                 |
| Drizzle ORM / Kit | 0.45.x / 0.31.x              |                                                                                                                 |
| Better Auth       | 1.7.x                        |                                                                                                                 |
| Anthropic SDK     | `@anthropic-ai/sdk`, current | Only in the `LlmClient` adapter                                                                                 |
| Tailwind CSS      | 4.x                          |                                                                                                                 |
| ESLint            | 10.x with the Babel parser   | TypeScript 7 has no JavaScript compiler API, so `typescript-eslint` cannot run; `tsc` enforces type-level rules |
| Playwright        | 1.6x                         | End-to-end tests only                                                                                           |
| Python            | 3.12+                        | Local runner and content verification; pinned in `packages/runner/environments/`                                |
| Docker            | Current                      | Development database; the self-hosting stack                                                                    |

Pin exact versions in `package.json`, as the starter already does.

## 10. Local development

Prerequisites: Bun, Node 24, Docker, Python 3.12 with `uv`.

```
bun install
docker compose -f docker-compose.dev.yml up -d     # Postgres
bun run db:migrate && bun run content:sync && bun run db:seed   # content goes to ./.storage with the fs driver
bun dev
```

- With `RUNNER_PROVIDER=local`, submissions run as a subprocess on the developer's
  machine. That provider is not a security boundary and refuses to start when
  `NODE_ENV=production`.
- With no `ANTHROPIC_API_KEY`, the LLM adapter is the fake. The pipeline runs end to end
  with canned outputs, which is enough to develop everything except prompt quality.
- With no email driver, emails are printed to the console.

## 11. Code conventions

- TypeScript strict mode everywhere; `noUncheckedIndexedAccess` stays on.
- ES modules only. No default exports except where a framework requires one.
- Database columns are `snake_case`; TypeScript and JSON are `camelCase`.
- Timestamps are UTC, stored as `timestamptz`, serialised as ISO 8601 strings.
- IDs are UUIDv7 strings generated by the application, except user and session IDs
  (Better Auth) and paper and problem IDs (slugs).
- Errors: services throw typed `AppError`s; one handler converts them to the error
  envelope in spec 05 §3. No `try/catch` that swallows errors.
- Formatting by Prettier; lint must pass with zero warnings, as the starter already enforces.
