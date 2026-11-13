# backend

The HTTP API: a [Hono](https://hono.dev) app on [Bun](https://bun.com). All business logic
lives here (docs/specs/01-architecture.md).

## Run

```sh
cp .env.example .env     # once; set BETTER_AUTH_SECRET (openssl rand -base64 32)
bun run db:migrate       # from the repository root, with docker-compose.dev.yml running
bun dev                  # from the repository root, or `bun run dev` here
```

Listens on `http://localhost:8797`. `GET /api/health` returns `{ "ok": true, "version": "dev" }`;
`GET /api/v1/papers` lists the papers published with `bun run content:sync`. The API's
contract is in docs/specs/05-api.md and runnable as `bun run api:contract`.

Accounts (docs/specs/06-auth.md) are Better Auth, mounted at `/api/auth/*`. In development
emails are printed to this process's output (`EMAIL_DRIVER=log`), so verification and
reset links can be followed from the terminal.

## Entry points

| File           | Used by                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `src/main.ts`  | Local development and self-hosting: starts `Bun.serve`, shuts down gracefully on SIGTERM. |
| `src/index.ts` | Serverless hosts: default-exports the app. `vercel.json` selects the Bun runtime.         |

Both build the same app with `createApp()` in `src/create-app.ts`.

## Layout

| Path                | Holds                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/env.ts`        | The only reader of `process.env`. Validates with zod; fails fast naming bad variables.                                           |
| `src/create-app.ts` | Middleware, error handling, route mounting.                                                                                      |
| `src/routes/`       | One router per resource. Validate input, call a service, shape the response.                                                     |
| `src/auth/`         | Better Auth's configuration, and the options that shape its tables.                                                              |
| `src/services/`     | Business logic: content catalogue, accounts and roles, rate limiter, email templates.                                            |
| `src/adapters/`     | Wiring to storage and email: the read-only content store, the email drivers.                                                     |
| `src/cli/`          | `content:sync`, `content:export`, `content:status`, `admin:grant`, `admin:password`.                                             |
| `src/middleware/`   | Request context, logging, cache policy, body limit, error envelope, session, guards.                                             |
| `scripts/`          | `auth:schema`: regenerates `packages/db/src/schema/auth.ts` from Better Auth.                                                    |
| `src/lib/`          | `AppError`, the JSON logger, `validate()` for request input.                                                                     |
| `test/`             | `bun test` suites using `app.request()`; no network. Database suites need `DATABASE_URL` and create their own database per file. |

## Conventions

- Throw `AppError(code)` for expected failures; the error handler renders the envelope from
  docs/specs/05-api.md §3. Anything else becomes a logged `internal_error`.
- Read request input only through `validate(target, schema)`.
- Use only Web-standard APIs in routes and middleware, so the app runs on any host.
- Guard routes with `requireAuth()`, `requireVerified()`, `requireRole()` and
  `requireFeature()` from `src/middleware/guards.ts`. Everything under `/v1/admin` already
  sits behind `requireRole("maintainer")`.

## Account commands

```sh
bun run admin:grant <email> <user|maintainer|admin>   # refuses to demote the last admin
echo 'new password' | bun run admin:password <email>  # for instances without email
bun run auth:schema && bun run db:generate             # after changing src/auth/schema-options.ts
```
