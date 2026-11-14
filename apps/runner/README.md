# runner

The bundled sandbox for self-hosted instances (docs/specs/13-self-hosting.md §5): a small
Bun HTTP service that runs each submission in a fresh, locked-down Docker container and
returns its result. The hosted deployment uses Vercel Sandbox instead and does not deploy
this service.

It needs the Docker daemon, which is equivalent to root on the host, so it has no public
port and only the backend and worker can reach it. In `docker-compose.yml` it holds the
Docker socket and is on its own network.

## Run it outside Docker

```sh
bun run runner:images                    # once, from the repository root
cp apps/runner/.env.example apps/runner/.env   # set RUNNER_TOKEN (openssl rand -hex 32)
bun run --cwd apps/runner start          # listens on :8798
```

Then point the backend at it in `apps/backend/.env`:

```sh
RUNNER_PROVIDER=http
RUNNER_URL=http://localhost:8798
RUNNER_TOKEN=<the same token>
```

## API

| Method and path | Auth                                  | Does                                                                 |
| --------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `GET /health`   | None                                  | `{ ok, running, queued }`                                            |
| `POST /v1/runs` | `Authorization: Bearer $RUNNER_TOKEN` | Takes a `RunRequest` (validated), answers with its `RunResult` (200) |

`400` for an invalid request, `401` without the token, `503` when `RUNNER_MAX_QUEUE` runs
are already waiting, `502` when Docker fails. The backend records all of these as
`internal_error`.

## Each run's container

No network, a read-only root filesystem with 64 MB tmpfs `/work` and `/tmp`, the
problem's memory plus 1 GB with no swap, one CPU, 128 processes, all capabilities
dropped, no privilege escalation, user `10001`, no environment variables, removed
afterwards and killed 15 s after the harness's own 60 s limit. Files arrive on standard
input (`src/bootstrap.py`). Set `RUNNER_DOCKER_RUNTIME=runsc` to run under gVisor, which
an instance open to the public should do.
