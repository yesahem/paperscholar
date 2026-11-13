# Implementation specs

These specs describe how to build an **open-source, free, self-hostable** platform for
learning ML papers by implementing them. It is an alternative to the reference site
analysed in [`../how-it-works.md`](../how-it-works.md), with two deliberate differences:

1. **Nothing is paid.** Every feature the reference sells is free here. There is no
   payment code.
2. **Papers are turned into lessons by an AI pipeline.** A maintainer uploads a paper; the
   system chunks it, writes the learning steps and their tests, verifies them by running
   code, and waits for a human to approve.

Stack: **Bun + Hono (serverless) for the backend, Next.js for the frontend.**

First written 2026-11-13 against a stock Turborepo starter (Bun 1.3.14, Next.js 16.3.8,
React 19.2.8, TypeScript 7.0.2, no backend yet). Revised the same day to remove billing
and add the paper pipeline.

## Reading order

| #   | Spec                                                 | What it settles                                                                  |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| 01  | [Architecture](./01-architecture.md)                 | Components, request paths, serverless and self-hosted modes                      |
| 02  | [Monorepo](./02-monorepo.md)                         | Target layout, packages, scripts, environment variables                          |
| 03  | [Content](./03-content.md)                           | What a paper and a problem are, how they are stored in R2, how they are verified |
| 04  | [Database](./04-database.md)                         | Tables for users, submissions, progress and job state                            |
| 05  | [API](./05-api.md)                                   | Conventions and the endpoint catalogue                                           |
| 06  | [Auth](./06-auth.md)                                 | Accounts, sessions, roles                                                        |
| 07  | [Runner](./07-runner.md)                             | Executing untrusted Python and producing a verdict                               |
| 08  | [Web](./08-web.md)                                   | Routes, rendering strategy, the workspace screen                                 |
| 09  | [Paper pipeline](./09-paper-pipeline.md)             | **Upload → chunk → plan → write → verify → review → publish**                    |
| 10  | [Secondary features](./10-secondary-features.md)     | Quizzes, roadmap, listings, courses, cold mail, mock interview                   |
| 11  | [Security and operations](./11-security-ops.md)      | Threat model, limits, testing, CI, deployment                                    |
| 12  | [Milestones](./12-milestones.md)                     | Build order with acceptance criteria                                             |
| 13  | [Open source and self-hosting](./13-self-hosting.md) | Licence, Docker stack, optional services, feature switches                       |

The paper pipeline is specified completely in **09**. Other specs only reference it.

## Wording

- **MUST** — required for the milestone to be accepted.
- **SHOULD** — the default; deviate only with a written reason.
- **MAY** — optional.

## Decisions

"Given" means you chose it. "Default" means I chose it to keep the specs concrete.

| #   | Decision                                                                                                                                  | Status                           | Where     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| D1  | Backend is a Hono app run by Bun                                                                                                          | Given                            | 01        |
| D2  | Frontend is Next.js (App Router) in `apps/web`                                                                                            | Given                            | 08        |
| D3  | Open source; every feature free; no payment code                                                                                          | Given                            | 13        |
| D4  | Papers become learning steps through an AI pipeline, not hand-written tests                                                               | Given                            | 09        |
| D5  | A maintainer uploads and approves; learners cannot publish                                                                                | Given (as I read "an authority") | 09 §2     |
| D6  | Generated steps must pass automated sandbox checks before a human can publish them                                                        | Default                          | 09 §8     |
| D7  | Paper content lives in object storage on Cloudflare R2, not in the database; `content/` in the repo is a seed library and exchange format | Given                            | 03 §2     |
| D8  | Two deployment modes from one codebase: serverless and Docker self-hosting                                                                | Default                          | 01 §7, 13 |
| D9  | Hosted API runs on Vercel Functions with the Bun runtime                                                                                  | Default                          | 01 §7     |
| D10 | The browser only talks to the web origin; `/api/*` is proxied to the API                                                                  | Default                          | 01 §4     |
| D11 | Untrusted code runs in an isolated sandbox, never in the API process                                                                      | Default                          | 07        |
| D12 | Submissions are asynchronous: create, then poll                                                                                           | Default                          | 07 §3     |
| D13 | Verdicts are structured per-test JSON                                                                                                     | Default                          | 07 §4     |
| D14 | Postgres with Drizzle ORM for users, progress and job state only                                                                          | Default                          | 04        |
| D15 | Better Auth for accounts and sessions                                                                                                     | Default                          | 06        |
| D16 | Claude (`claude-opus-5-5`) for the pipeline and other LLM features, behind an adapter                                                     | Default                          | 09 §14    |
| D17 | Every external service is optional; features switch off when unconfigured                                                                 | Default                          | 13 §4     |

D7 was revised twice. Content was first compiled from files at build time, which cannot
support a pipeline that publishes papers at run time. It then moved to database tables.
You chose object storage instead: papers are versioned JSON objects in an R2 bucket, with
one index object as the commit point. A local-disk driver with the same layout exists for
development and for self-hosting without a Cloudflare account.

## Open questions for you

None blocks starting. Each has a working default.

1. **Licence.** Default: MIT for code, matching "anyone can use this for free". If you
   want people who run modified hosted copies to share their changes, choose AGPL-3.0
   instead. Problem text and tests need a licence too; default CC BY-SA 4.0.
2. **Publishing the teardown.** _Partly settled in M0:_ `docs/` is now tracked, so the
   specs are public with the code. `docs/how-it-works.md`, a teardown of another site,
   stays git-ignored until you decide whether to publish it. Links to it from these specs
   only resolve locally until then.
3. **Who may upload papers.** Default: only `maintainer` and `admin`. An alternative is to
   let any signed-in user _propose_ a paper, still requiring a maintainer to publish.
4. **Hosted API platform (D9).** Vercel is the mainstream serverless host that runs Bun
   natively. Confirm, or name another.
5. **Sandbox vendor for the hosted instance.** Default: Vercel Sandbox, with E2B as an
   alternative. Self-hosters use the bundled Docker runner.
6. **`apps/docs`.** _Settled:_ removed by the maintainer before M0.
7. **Product name and domain.** _Name settled:_ PaperScholar, from the repository name,
   set in one place (`SITE` in `packages/shared`). The domain is still open; the specs
   use `example.com`.
8. **Data for job listings and the professor directory.** The reference does not reveal
   its sources. In an open repository the data itself cannot be shipped unless its source
   permits that. See 10 §3.
9. **Speech vendor** for the voice part of the mock interview (milestone 10).
10. **Who pays for the hosted instance.** With no revenue, sandbox runs and LLM calls are
    a running cost. The specs cap them with limits; funding is outside their scope.

## Ground rules that apply to every spec

- **All content is original.** Descriptions, tests, tutorials and quiz questions are
  written for this project, by people or by the pipeline. Nothing is copied from the
  reference site, and papers themselves are linked, not redistributed.
- **No plan checks anywhere.** Access rules depend on sign-in state and role only. Limits
  are flat per instance and exist to prevent abuse.
- **Check the installed version's docs before using a framework API.** Next.js 16.3,
  TypeScript 7 and Turborepo 2.11 are newer than most published guidance. `AGENTS.md`
  already requires this for Turborepo; treat Next.js, Better Auth, the sandbox SDK and the
  Anthropic SDK the same way. Where a spec names a vendor option, the name is a pointer to
  look up, not a guaranteed spelling.
- **Vendors sit behind interfaces.** Sandbox, storage, email and LLM calls each have one
  module that owns the vendor SDK. Nothing else imports it.
