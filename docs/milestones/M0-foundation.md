# M0 — Foundation and open-source setup

**Status:** done locally, on branch `feat/m0-foundation`. Deployment to a host is pending (see
[Not done](#not-done)).
**Spec:** [`docs/specs/12-milestones.md`](../specs/12-milestones.md) §M0.

## Summary

The Turborepo starter is now the project's skeleton: a Hono backend on Bun with a standard
error contract, a Next.js web app that reaches it through a same-origin `/api` proxy, a
shared component kit with design tokens, shared contracts, a database package with its first
migration, CI, and the open-source project files. Project rules for code quality, naming and
reusable components are in [`AGENTS.md`](../../AGENTS.md) and apply to every later milestone.

## What was built

### Backend — `apps/backend`

| Piece                                                                                                                                                            | File                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| App factory: request id → request logger → security headers → `private, no-store` default → 256 KB body limit; error and not-found handlers; routes under `/api` | `src/create-app.ts`               |
| Serverless entry (default export) and `Bun.serve` entry with graceful SIGTERM/SIGINT shutdown                                                                    | `src/index.ts`, `src/main.ts`     |
| Environment validation; the only reader of `process.env`; fails fast naming each bad variable                                                                    | `src/env.ts`                      |
| `AppError` with codes from `@repo/shared`                                                                                                                        | `src/lib/errors.ts`               |
| JSON logger: one line per event, errors serialised with cause and stack                                                                                          | `src/lib/logger.ts`               |
| `validate(target, schema)`: request input validation that always yields `validation_error`                                                                       | `src/lib/validation.ts`           |
| Error envelope for `AppError`, Hono's HTTP errors (e.g. malformed JSON → `validation_error`) and unexpected errors (logged, reported generically)                | `src/middleware/error-handler.ts` |
| `GET /api/health` → `{ ok: true, version }`, no dependencies touched                                                                                             | `src/routes/health.ts`            |
| Vercel Bun runtime selection                                                                                                                                     | `vercel.json`                     |

### Web — `apps/web`

- Tailwind CSS 4 with the shared tokens (`app/globals.css` imports `@repo/ui/styles.css`).
- `next.config.ts` validates the environment at load (so `dev`, `build` and `start` all fail
  fast) and rewrites `/api/:path*` to `API_ORIGIN`.
- Placeholder home page built only from `@repo/ui` components, with a live backend status
  check through the proxy. The real landing page arrives in M2.
- `not-found.tsx` and `error.tsx` (using Next 16.2+'s `retry` prop).
- `@/` import alias; starter CSS modules and demo assets removed.

### Component kit — `packages/ui`

Design tokens in `src/styles.css`: one `light-dark()` declaration per colour, following the
OS theme unless `<html data-theme>` overrides it; one global focus style; reduced-motion
support. Components, all keyboard-operable and labelled:

`Button` (+ `buttonVariants` for links) · `Field` (label, help, error, ARIA wiring via
`useFieldControl`) · `Input` · `Textarea` · `Label` · `FileUpload` (drag-and-drop or browse;
type, size and count checks; removable file list; keeps the native input in sync for forms)
· `Card` family · `Badge` · `Alert` · `Spinner` · `Skeleton` · `Separator`.

Utilities: `cn()`, `formatBytes()`, `validateFiles()` / `matchesAccept()` / `describeAccept()`.
Usage guide: [`packages/ui/README.md`](../../packages/ui/README.md).

### Shared contracts — `packages/shared`

Error codes with statuses and default messages, the error-body and health schemas,
`parseEnv` / `EnvError` / `httpOriginSchema` used by both apps, and `SITE` (product name
**PaperScholar**, taken from the repository name, changeable in one place).

### Database — `packages/db`

Drizzle over `Bun.sql` (`prepare: false` for transaction poolers, pool of 3), a migration
runner (`db:migrate`), and the first migration `0000_init.sql` creating
`rate_limit_counters` (spec 04 §4) with its retention index.

### Tooling and project files

- TypeScript presets: `library.json`, `react-library.json`, `bun.json`; base adds
  `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`.
- ESLint: fixed the starter's broken Babel preset resolution, enabled JSX parsing for
  `.tsx` (Babel 8 no longer does this itself), added a Bun preset and the import boundaries
  from spec 02 §5 (server-only packages are blocked in the web app and UI kit).
- `turbo.json`: `test` and `db:migrate` tasks; build and test environment variables declared
  for strict env mode.
- Prettier settings and a repo-wide `format` / `format:check`.
- `docker-compose.dev.yml`: Postgres 17 on host port 54330.
- `.github/workflows/ci.yml`: format check, lint, type-check, migrations against a fresh
  Postgres, tests, build; separate gitleaks secret scan.
- `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `AGENTS.md` project
  rules, and a root `CLAUDE.md` that imports them.

## How to run

```sh
bun install
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
docker compose -f docker-compose.dev.yml up -d
bun run db:migrate
bun dev        # web http://localhost:3000, backend http://localhost:8797
```

## Verification

All run locally on 2026-11-13, macOS, Bun 1.3.14, Node 24.22.2.

| Check                                    | Result                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `bun run format:check`                   | All files formatted                                                      |
| `bun run lint`                           | 5/5 packages, 0 warnings                                                 |
| `bun run check-types`                    | 5/5 packages pass                                                        |
| `bun run test`                           | 48 passed: backend 25, ui 13, shared 9, db 1 (against real Postgres)     |
| `bun run build`                          | Web build succeeds; `/` and `/_not-found` prerendered static             |
| `bun run db:migrate` on a fresh database | Applied; `rate_limit_counters` matches the schema; re-running is a no-op |

Acceptance checks from spec 12 §M0:

| Check                                                             | Evidence                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localhost:3000/api/health` reaches the backend through the proxy | `200 {"ok":true,"version":"dev"}` with `X-Request-Id`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`                                                                                                |
| Unknown API route returns the envelope with `not_found`           | `404 {"error":{"code":"not_found","message":"Not found.","requestId":"…"}}`                                                                                                                                                 |
| Missing required variable fails with a message naming it          | Backend: `Invalid backend environment configuration: - WEB_ORIGIN is required`, exit 1. Web: `Invalid web environment configuration: - API_ORIGIN is required`, build exit 1. Several bad variables are all listed at once. |
| Repository has a licence and no secrets                           | MIT `LICENSE`; only `.env.example` files are tracked                                                                                                                                                                        |
| Runs on Bun                                                       | Backend runs under `bun --hot` and `bun src/main.ts`; SIGTERM logs a shutdown and exits 0                                                                                                                                   |

The home page was also checked in headless Chrome in both light and dark themes; the
status badge showed "Online · dev", confirming the browser's request through the proxy.

## Deviations from the specs

The specs were updated in this change to match.

| Spec said                            | Built                                                                | Why                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Backend in `apps/api`                | `apps/backend`                                                       | The maintainer's `init` commit already created `apps/backend`.                                                                            |
| Entry files `server.ts` and `app.ts` | `main.ts` and `create-app.ts`; `index.ts` stays the serverless entry | Serverless hosts auto-detect `app`/`server`/`index` files; only the real serverless entry should match.                                   |
| Backend port 8787                    | 8797                                                                 | 8787 was already taken on the development machine; 8797 is less commonly used.                                                            |
| postgres.js driver                   | `Bun.sql` with Drizzle's `bun-sql` adapter                           | Everything that talks to Postgres runs on Bun, and `apps/backend/CLAUDE.md` asks for `Bun.sql`. It supports `prepare: false` for poolers. |
| `zValidator` in each route           | `validate()` wrapper                                                 | Guarantees one `validation_error` shape and turns malformed JSON into a 400, not a 500.                                                   |
| Dev Postgres on 5432                 | Host port 54330                                                      | 5432 is commonly taken by a system Postgres.                                                                                              |
| `typescript-eslint` implied          | Babel parser + `tsc`                                                 | TypeScript 7 has no JavaScript compiler API, which `typescript-eslint` needs.                                                             |

## Things found in the repository

- **The specs had been deleted.** At the start of M0, `docs/specs/` was empty and
  `docs/how-it-works.md` was missing (both were git-ignored, so never committed). They were
  restored unchanged from this session's editor backups, then updated for M0. They are now
  tracked, except `docs/how-it-works.md`, which stays ignored until you decide whether to
  publish a teardown of another site.
- **Leftovers from an earlier implementation attempt**, all git-ignored or empty and left
  untouched: `apps/api/` (build logs, a `dist` bundle, an `.env`, a local content cache),
  empty folder skeletons in `packages/{content,pipeline,runner,storage}/` and `content/`, a
  root `.venv/`, and a running Docker container `paper-scholar-dev-postgres-1` on port 54329
  with its own volume. The only removals were empty folders that blocked tools
  (`packages/db/drizzle/meta`, `apps/web/app/(marketing)`, `apps/web/test`). To clean up the
  rest: `docker compose -p paper-scholar-dev down -v`, then delete `apps/api/` and `.venv/`.
- **`apps/web/.env` predates M0** and already pointed at port 8797; it was left as is.

## Not done

| Item                                                                          | Why                                          | Next step                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy web and backend to Vercel, confirm the backend runs on the Bun runtime | Needs your Vercel account and project set-up | Create two Vercel projects (root `apps/web` and `apps/backend`), set `API_ORIGIN`, `NEXT_PUBLIC_SITE_URL` and `WEB_ORIGIN`, then check `/api/health` on the preview URL. `vercel.json` sets `bunVersion: "1.x"`; confirm the key against Vercel's current docs. |
| CI run on GitHub                                                              | Not pushed                                   | Runs on the first push or pull request.                                                                                                                                                                                                                         |

## Ready for M1

M1 (content model and runner) builds on: `@repo/shared` for content schemas, `@repo/db` for
`content_candidates`, the backend's `validate()` and `AppError`, and the `test/` layout.
The empty `content/` and `packages/*` skeletons from the earlier attempt should be removed
or replaced when M1 creates those packages.
