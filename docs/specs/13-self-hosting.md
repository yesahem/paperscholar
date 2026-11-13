# 13 — Open source and self-hosting

The project is open source and free to use. Anyone can clone it, run their own instance,
add their own papers, and change the code. There are no paid plans and no payment code.

## 1. Principles

1. **Everything is free.** No feature is locked behind a plan. Limits exist only to
   protect an instance from abuse and its operator from cost, and the operator sets them.
2. **One command to a working instance.** A newcomer gets the core loop running locally
   with Docker and no third-party accounts.
3. **Every external service is optional.** A feature that needs one switches itself off
   cleanly when it is not configured, and says what is missing.
4. **Same code everywhere.** The hosted serverless deployment and a self-hosted box run
   the same application; only adapters differ.
5. **No telemetry by default.** An instance reports nothing to the project.

## 2. Repository

| File                     | Purpose                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `LICENSE`                | The licence for the code (README Q1)                                         |
| `content/LICENSE`        | The licence for problem text and tests, if different from the code           |
| `README.md`              | What it is, a screenshot, quick start, link to docs                          |
| `CONTRIBUTING.md`        | Dev setup, conventions, how to contribute code and how to contribute a paper |
| `CODE_OF_CONDUCT.md`     | Standard contributor covenant                                                |
| `SECURITY.md`            | How to report a vulnerability privately                                      |
| `.env.example` files     | Every variable, with comments                                                |
| `docker-compose.yml`     | Self-hosting stack                                                           |
| `docker-compose.dev.yml` | Postgres and storage only, for development                                   |
| `docs/`                  | These specs and user-facing guides                                           |

The specs belong in the public repository, so contributors can read them. That requires
removing `docs/` from `.gitignore` (README Q2).

## 3. Deployment modes

|                                       | Serverless (hosted)                                         | Self-hosted                                        |
| ------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Web                                   | Next.js on a serverless host                                | `next start` in a container                        |
| API                                   | Hono on the Bun runtime, as functions                       | The same Hono app under `Bun.serve` in a container |
| Pipeline and background work          | Internal endpoints driven by self-invocation and a schedule | A worker container running `bun run worker`        |
| Sandbox                               | Managed microVM vendor                                      | The bundled runner service using Docker            |
| Database                              | Managed Postgres through a pooler                           | Postgres container, or any Postgres                |
| Storage for paper content and uploads | Cloudflare R2                                               | A local directory (`fs` driver), or R2             |

### Self-hosted stack

```
                    ┌──────────── internal network ────────────┐
  browser ──▶ web ──┼──▶ api ──▶ postgres                      │
              :3000 │     │  ╲                                 │
                    │     │   ▶ runner ──▶ short-lived         │
                    │   worker ─▶  ▲       sandbox containers  │
                    │              └── only the runner can     │
                    │                  start containers        │
                    └──────────────────────────────────────────┘
```

| Service    | Image                                      | Notes                                                                  |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `web`      | Built from `apps/web`                      | The only service published to the outside                              |
| `backend`  | Built from `apps/backend`                  | Runs migrations and `content:sync` on start; mounts the storage volume |
| `worker`   | Same image as `backend`, different command | Pipeline tasks and scheduled jobs; mounts the same storage volume      |
| `runner`   | Built from `apps/runner`                   | Executes sandbox runs; reachable only from `backend` and `worker`      |
| `postgres` | Official image                             | With a named volume                                                    |

## 4. Configuration levels

**Minimal — works with no accounts anywhere.**

| Need                                 | How it is met                                           |
| ------------------------------------ | ------------------------------------------------------- |
| Database                             | Bundled Postgres                                        |
| Sandbox                              | Bundled runner                                          |
| Storage, including all paper content | A Docker volume, through the `fs` driver                |
| Sign-in                              | Email and password; email verification off              |
| Content                              | The papers shipped in `content/`, loaded on first start |

Gives: catalogue, workspace, run and submit, progress, profiles, leaderboard, quizzes,
roadmap.

**Add as wanted.**

| To enable                                                  | Configure                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Paper pipeline, cold mail, mock interview                  | `ANTHROPIC_API_KEY`                                                                                             |
| Email verification and password reset by email             | `EMAIL_DRIVER=smtp` and the `SMTP_*` settings, or `EMAIL_DRIVER=resend` and `RESEND_API_KEY`; plus `EMAIL_FROM` |
| Google sign-in                                             | Google OAuth client ID and secret                                                                               |
| Content and uploads on Cloudflare R2 instead of local disk | `STORAGE_DRIVER=r2` and the R2 settings                                                                         |
| Courses with video                                         | Your own video files in storage                                                                                 |
| Voice in the mock interview                                | A speech provider                                                                                               |

### Feature switches

The API computes which features are on from its configuration and serves them at
`GET /v1/config`. The web app hides anything that is off. A feature can also be turned off
explicitly.

| Feature             | On when                         | Explicit switch                              |
| ------------------- | ------------------------------- | -------------------------------------------- |
| `pipeline`          | LLM key present                 | `FEATURE_PIPELINE=false`                     |
| `coldMail`          | LLM key present                 | `FEATURE_COLD_MAIL=false`                    |
| `interview`         | LLM key present                 | `FEATURE_INTERVIEW=false`                    |
| `courses`           | Course content exists           | `FEATURE_COURSES=false`                      |
| `listings`          | Listings data has been imported | `FEATURE_LISTINGS=false`                     |
| `googleSignIn`      | Google credentials present      | —                                            |
| `emailVerification` | An email sender is configured   | `REQUIRE_EMAIL_VERIFICATION=false`           |
| `passwordReset`     | An email sender is configured   | —                                            |
| `signups`           | Always                          | `ALLOW_SIGNUPS=false` for a private instance |

### Limits

All limits in spec 11 §3 and spec 09 §18 are environment variables with the documented
defaults. An operator running a private instance for a class can raise them; a public
instance should keep them.

## 5. The bundled runner

`apps/runner` is a small Bun HTTP service used only in self-hosted mode. It implements the
`SandboxProvider` contract (spec 07 §4) by starting one Docker container per run.

**Why a separate service.** Starting containers requires access to the Docker daemon,
which is equivalent to root on the host. That access is given to one tiny service with no
public port, instead of to the internet-facing API.

Each run's container is started with:

- no network;
- a read-only root filesystem and a small temporary working directory;
- memory, CPU and process-count limits from the request;
- all Linux capabilities dropped and privilege escalation disabled;
- a non-root user;
- a hard kill at the wall-clock limit; and
- removal after the run.

The Python images are built from the same pinned requirement files as every other
environment (spec 07 §8).

**Isolation levels — be honest about them.**

| Setting                                        | Isolation                                 | Suitable for                                                       |
| ---------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| Plain Docker (default)                         | Containers share the host kernel          | Yourself, a team, a class: people you trust not to attack the host |
| Docker with a sandboxed runtime such as gVisor | A user-space kernel between code and host | An instance open to the public                                     |
| Managed microVM vendor                         | Hardware virtualisation                   | An instance open to the public                                     |

`README.md` and the compose file state this plainly. Running an open, public instance on
plain Docker is not recommended.

## 6. First run

```
git clone <repo> && cd <repo>
cp .env.example .env            # set WEB_ORIGIN and random secrets
docker compose up -d
```

On start the `backend` container applies migrations, then loads the bundled papers.

**The first administrator.** `ADMIN_EMAILS` lists email addresses that are given the
`admin` role when they sign up. It is read only at sign-up, so removing an address later
does not demote anyone. `bun run admin:grant <email> <role>` changes a role afterwards.

## 7. Content on a self-hosted instance

| Source                              | How it arrives                                               | Updated by                        |
| ----------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| The project's library in `content/` | `content:sync` on start uploads it to the instance's storage | Pulling a new version of the repo |
| Your own papers                     | The pipeline (spec 09) or files you add to `content/`        | You                               |

`content:sync` only creates or updates papers whose source is the repository. It never
overwrites or deletes a paper made on the instance.

**Giving back.** `bun run content:export <paper-id>` writes one of your papers as files.
Opening a pull request with those files proposes it for the shared library. CI runs
`content:verify` on it.

## 8. Upgrades and backups

- Upgrade: pull, rebuild, `docker compose up -d`. Migrations run on start and are
  backwards-compatible (spec 04 §9).
- Releases are tagged and have a changelog. Breaking configuration changes are called out.
- Back up the Postgres volume **and** the storage volume or bucket, together. Papers are
  in storage and progress is in Postgres; one without the other is incomplete. `docs/`
  includes a short guide with a restore test.
- Moving between drivers is a straight copy: the `fs` directory and the R2 bucket use the
  same keys, so `rclone` or any S3 tool moves an instance's content in either direction.

## 9. Contributing a paper to the project

Two routes, both ending in the same review:

1. **Files.** Write a paper folder by hand following spec 03, run `content:verify`, open a
   pull request.
2. **Pipeline.** Generate it on your own instance, review it, export it, open a pull
   request.

Either way a project maintainer reads it and CI verifies it before it merges.

## 10. Acceptance checks

- On a clean machine with only Docker installed, the three commands in §6 give a site
  where a new user can sign up, open a problem, run code and see a verdict.
- With no optional service configured, no screen shows a broken feature; switched-off
  features are absent or explain what to configure.
- The `runner` service is not reachable from outside the internal network.
- A submission that tries to reach the network from the bundled runner fails.
- Setting `ANTHROPIC_API_KEY` and restarting makes the upload screen appear for an admin.
- Upgrading from the previous release keeps all users, progress and instance-made papers.
- The repository contains no payment code, no plan checks, and no secrets.
