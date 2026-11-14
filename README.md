# PaperScholar

Learn machine-learning papers by implementing them, one step at a time, with tests that check
your code. Free to use, open source, and self-hostable.

> **Status: early development.** Papers, accounts, and running and submitting code (M0–M4)
> work, locally and self-hosted. Follow progress in
> [`docs/milestones/`](docs/milestones/README.md); the plan is in [`docs/specs/`](docs/specs/README.md).

## What it will do

- Break a paper into small implementation steps, each with a description, starter code and tests.
- Run your Python in an isolated sandbox and show per-test results.
- Turn an uploaded paper into verified learning steps with an AI pipeline and human review.
- Track progress, streaks and a leaderboard. Every feature is free.

## Repository

| Path                                                   | What                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `apps/web`                                             | Next.js frontend. Proxies `/api/*` to the backend.                   |
| `apps/backend`                                         | Hono API on Bun. Runs serverless or as a long-running server.        |
| `apps/runner`                                          | Self-hosting only: runs each submission in its own Docker container. |
| `packages/runner`                                      | Sandbox providers, the Python test harness, the adversarial suite.   |
| `packages/content`, `packages/storage`                 | Paper content and the object storage it lives in.                    |
| `packages/ui`                                          | Shared component kit and design tokens.                              |
| `packages/shared`                                      | Contracts shared by both apps: error codes, schemas, env parsing.    |
| `packages/db`                                          | Drizzle schema, migrations and the Postgres client.                  |
| `packages/eslint-config`, `packages/typescript-config` | Shared tooling presets.                                              |
| `docs/specs`                                           | What to build.                                                       |
| `docs/milestones`                                      | What has been built, milestone by milestone.                         |

## Host it yourself

Needs only Docker. From a clone:

```sh
cp .env.example .env     # set the three secrets: openssl rand -hex 32
docker compose up -d     # builds everything; the first time takes several minutes
```

Open `http://localhost:8080` (`WEB_ORIGIN` in `.env`), sign up and run code. Migrations
and the bundled papers load on start. Email, Google sign-in and Cloudflare R2 are
optional; `.env.example` lists them.

**Isolation.** Learners' code runs in locked-down Docker containers (no network,
read-only filesystem, memory, CPU and process limits, no capabilities). Plain Docker
shares this machine's kernel: fine for you, a team or a class, **not recommended for an
instance open to the public**. For that, install [gVisor](https://gvisor.dev) and set
`RUNNER_DOCKER_RUNTIME=runsc`, or use a managed microVM sandbox (docs/specs/13-self-hosting.md §5).

Back up the `postgres-data` and `storage` volumes together.

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

In development, code runs through the local Python from `runner:setup`, which isolates
nothing. To use the Docker sandbox instead, see `apps/runner/README.md`.

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
bun run runner:adversarial --provider http   # the hostile submissions of spec 07 §10, on the Docker runner
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
