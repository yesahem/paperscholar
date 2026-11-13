# PaperScholar

Learn machine-learning papers by implementing them, one step at a time, with tests that check
your code. Free to use, open source, and self-hostable.

> **Status: early development.** Foundation (M0) and content model with runner (M1) are in place. Follow progress in
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

Requires [Bun](https://bun.com) 1.3.14, Node.js 24, Docker and [uv](https://docs.astral.sh/uv/).

```sh
bun install

# Environment files. Local defaults work as-is, except the backend's auth secret.
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> apps/backend/.env

# Database and S3-compatible object store
docker compose -f docker-compose.dev.yml up -d
bun run db:migrate

# Python for running problems (NumPy, pytest, CPU PyTorch)
bun run runner:setup

# Load the paper library into storage (apps/backend/.storage by default)
bun run content:sync

# Web on http://localhost:3000, backend on http://localhost:8797
bun dev
```

Hide or show a paper without a redeploy: `bun run content:status <paper-id> draft` (or
`published`). The site reflects it within a minute.

`http://localhost:3000/api/health` reaches the backend through the web app's proxy.

Sign up from the header. In development, emails are printed by the backend instead of
being sent, so the verification and password-reset links appear in the `bun dev` output.
Make yourself an admin with `bun run admin:grant <email> admin`, or list your address in
`ADMIN_EMAILS` before signing up.

## Checks

```sh
bun run format:check   # Prettier
bun run lint           # ESLint, zero warnings
bun run check-types    # TypeScript 7
bun run test           # bun test (database and S3 tests run when configured)
bun run content:verify # every problem: solution passes, starter fails, tests are sound
bun run build
bun run api:contract   # the Postman API contract, against a running backend (postman/README.md)
```

CI runs the same checks against a fresh Postgres and an S3-compatible server, and scans for
secrets.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Project rules for code, naming and components are in
[AGENTS.md](AGENTS.md).

## Licence

[MIT](LICENSE).
