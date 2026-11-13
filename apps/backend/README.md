# backend

The HTTP API: a [Hono](https://hono.dev) app on [Bun](https://bun.com). All business logic
lives here (docs/specs/01-architecture.md).

## Run

```sh
cp .env.example .env     # once
bun dev                  # from the repository root, or `bun run dev` here
```

Listens on `http://localhost:8797`. `GET /api/health` returns `{ "ok": true, "version": "dev" }`.

## Entry points

| File           | Used by                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `src/main.ts`  | Local development and self-hosting: starts `Bun.serve`, shuts down gracefully on SIGTERM. |
| `src/index.ts` | Serverless hosts: default-exports the app. `vercel.json` selects the Bun runtime.         |

Both build the same app with `createApp()` in `src/create-app.ts`.

## Layout

| Path                | Holds                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| `src/env.ts`        | The only reader of `process.env`. Validates with zod; fails fast naming bad variables. |
| `src/create-app.ts` | Middleware, error handling, route mounting.                                            |
| `src/routes/`       | One router per resource. Validate input, call a service, shape the response.           |
| `src/middleware/`   | Request context, logging, cache policy, body limit, error envelope.                    |
| `src/lib/`          | `AppError`, the JSON logger, `validate()` for request input.                           |
| `test/`             | `bun test` suites using `app.request()`; no network.                                   |

## Conventions

- Throw `AppError(code)` for expected failures; the error handler renders the envelope from
  docs/specs/05-api.md §3. Anything else becomes a logged `internal_error`.
- Read request input only through `validate(target, schema)`.
- Use only Web-standard APIs in routes and middleware, so the app runs on any host.
