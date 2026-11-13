# PaperScholar

Learn machine-learning papers by implementing them, one step at a time, with tests that check
your code. Free to use, open source, and self-hostable.

> **Status: early development.** The foundation (M0) is in place. Follow progress in
> [`docs/milestones/`](docs/milestones/README.md); the plan is in [`docs/specs/`](docs/specs/README.md).

## What it will do

- Break a paper into small implementation steps, each with a description, starter code and tests.
- Run your Python in an isolated sandbox and show per-test results.
- Turn an uploaded paper into verified learning steps with an AI pipeline and human review.
- Track progress, streaks and a leaderboard. Every feature is free.

## Repository

| Path                                                   | What                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `apps/web`                                             | Next.js frontend. Proxies `/api/*` to the backend.                |
| `apps/backend`                                         | Hono API on Bun. Runs serverless or as a long-running server.     |
| `packages/ui`                                          | Shared component kit and design tokens.                           |
| `packages/shared`                                      | Contracts shared by both apps: error codes, schemas, env parsing. |
| `packages/db`                                          | Drizzle schema, migrations and the Postgres client.               |
| `packages/eslint-config`, `packages/typescript-config` | Shared tooling presets.                                           |
| `docs/specs`                                           | What to build.                                                    |
| `docs/milestones`                                      | What has been built, milestone by milestone.                      |

## Run it locally

Requires [Bun](https://bun.com) 1.3.14, Node.js 24 and Docker.

```sh
bun install

# Environment files (local defaults work as-is)
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env

# Database
docker compose -f docker-compose.dev.yml up -d
bun run db:migrate

# Web on http://localhost:3000, backend on http://localhost:8797
bun dev
```

`http://localhost:3000/api/health` reaches the backend through the web app's proxy.

## Checks

```sh
bun run format:check   # Prettier
bun run lint           # ESLint, zero warnings
bun run check-types    # TypeScript 7
bun run test           # bun test (database tests run when DATABASE_URL is set)
bun run build
```

CI runs the same checks, applies migrations to a fresh Postgres, and scans for secrets.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Project rules for code, naming and components are in
[AGENTS.md](AGENTS.md).

## Licence

[MIT](LICENSE).
