# 11 — Security and operations

## 1. Threat model

| Threat                                                  | Mitigation                                                                                                                                                                                          | Spec              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Malicious code in a submission attacks the instance     | Isolated sandbox per run, no secrets inside, API never executes user code                                                                                                                           | 07 §1, §8         |
| Submission used to attack third parties or mine         | No outbound network; hard time and CPU limits                                                                                                                                                       | 07 §8, §9         |
| Cost exhaustion through mass submissions                | Verified email required; per-user rate limit, daily quota, one run at a time; global daily ceiling                                                                                                  | 07 §9             |
| Hidden tests or solutions leak                          | Private parts in separate objects in a private bucket, never loaded by learner-serving code; no presigned URLs for content; field allow-lists; canary test; hidden tests show name and message only | 03 §9, 07 §5      |
| Content corrupted or lost by a bad write                | Immutable versions; one index object as the commit point, written under a lock, with history kept; bucket backup                                                                                    | 03 §2.2, §9 below |
| A learner reaches maintainer functions                  | Role enforced in the API on every `/v1/admin` route; `404` for everyone else                                                                                                                        | 06 §6             |
| Bulk export of listings data                            | Small pages, per-user daily row caps                                                                                                                                                                | 10 §3             |
| An uploaded PDF carries instructions aimed at the model | Document treated as material, not instructions; nothing generated is used without sandbox verification and human approval                                                                           | 09 §19            |
| Model-generated code is harmful or wrong                | Runs only in the sandbox; must pass checks V1–V10; a maintainer publishes                                                                                                                           | 09 §8, §11        |
| LLM cost exhaustion                                     | Uploads limited to maintainers; token budget per ingestion; daily limits; per-user limits on other LLM features                                                                                     | 09 §18            |
| Docker socket exposure on self-hosted instances         | Only the internal runner service can start containers                                                                                                                                               | 13 §5             |
| Account takeover                                        | Vetted auth library; `HttpOnly` cookies; reset tokens single-use and short-lived; auth rate limits                                                                                                  | 06                |
| Cross-site request forgery                              | `SameSite=Lax`, origin check, JSON-only mutations                                                                                                                                                   | 06 §7             |
| Cross-site scripting through content or user text       | No raw HTML in markdown; React escaping; strict CSP                                                                                                                                                 | 08 §7, §2 below   |
| Prompt injection through uploaded CVs                   | Inputs treated as data; output shown only to its owner as plain text; no tools                                                                                                                      | 10 §6             |
| Enumeration of users or emails                          | Generic reset response; `404` for others' resources; search needs ≥ 2 characters                                                                                                                    | 05 §3, 06 §4      |
| Secrets leak                                            | Secrets only in the API's environment; none in the web app or sandbox; none in logs                                                                                                                 | 01 §9             |
| Leaderboard cheating by pasting known solutions         | Out of scope. Accepted, as on comparable sites.                                                                                                                                                     | —                 |

## 2. HTTP security headers

Set by `apps/web` on every response:

| Header                       | Value                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `Content-Security-Policy`    | Below                                                                                 |
| `Strict-Transport-Security`  | `max-age=63072000; includeSubDomains; preload`                                        |
| `X-Content-Type-Options`     | `nosniff`                                                                             |
| `Referrer-Policy`            | `strict-origin-when-cross-origin`                                                     |
| `Permissions-Policy`         | `camera=(), geolocation=(), microphone=()` — `microphone=(self)` on `/interview` only |
| `Cross-Origin-Opener-Policy` | `same-origin`                                                                         |

Content-Security-Policy starting point:

```
default-src 'self';
script-src 'self' 'nonce-<per-request>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: <R2 public bucket URL>;
font-src 'self';
connect-src 'self' <R2 endpoint, for presigned uploads>;
media-src 'self' blob: <R2 endpoint, for presigned video>;
worker-src 'self' blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

- Self-hosting the editor, fonts and KaTeX is what makes `'self'` sufficient.
- `'unsafe-inline'` for styles is needed by the editor. `'unsafe-eval'` is not allowed for
  scripts; if the editor requires it in practice, scope that relaxation to the workspace
  route only.
- Roll out in report-only mode first, with a report endpoint, then enforce.

> **M2 status.** Sent as `Content-Security-Policy-Report-Only` from `next.config.ts`
> (`apps/web/lib/security/headers.ts`), reporting to `POST /api/csp-report`. Scripts are
> allowed with `'unsafe-inline'` instead of a nonce: Next.js applies nonces only to pages
> rendered per request, and content pages must stay cached (spec 08 §1). Before enforcing,
> choose between hashes of Next's inline scripts, or per-request rendering of pages that
> need a strict policy.

The API sets `X-Content-Type-Options`, `Cache-Control` per spec 05 §4, and no CORS headers
at all: it is not meant to be called from other origins.

## 3. Rate limits and quotas

Fixed-window counters in Postgres (`rate_limit_counters`, spec 04 §4), incremented with a
single upsert that returns the new count. Chosen because it needs no extra service and the
volumes are small. If limiter queries become a measurable share of database load, move to
a dedicated key-value store behind the same interface.

| Scope                           | Key        | Limit                                      |
| ------------------------------- | ---------- | ------------------------------------------ |
| Sign-in, sign-up, reset request | IP         | 10 per 10 minutes (Better Auth's limiter)  |
| Submissions                     | User       | 10 per minute                              |
| Submissions                     | User       | Daily limit, same for everyone             |
| Submissions                     | Global     | Daily ceiling                              |
| Mutations in general            | User       | 60 per minute                              |
| Public reads through the API    | IP         | 300 per minute                             |
| User search                     | IP         | 30 per minute                              |
| Avatar and CV upload            | User       | 10 per hour                                |
| Cold mail, mock interview       | User       | Daily or monthly limit, same for everyone  |
| Paper ingestions                | Maintainer | 10 per day; 2 running at once per instance |

**Client IP.** Requests reach the API through the web app's proxy. Use the header the
hosting platform guarantees carries the original client address, and test on a preview
deployment that it survives the proxy hop. Never trust a client-supplied forwarding header.

> **Measured in M3.** The header is `CLIENT_IP_HEADER` (default `x-forwarded-for`), with
> `TRUSTED_PROXIES` for chains. `next start`'s `/api` rewrite **adds no forwarding header
> and passes a client-supplied one through unchanged** (Next.js 16 also removed
> `request.ip`). So on a self-hosted box the address must be set by a reverse proxy in
> front of `web` that overwrites the header; M4's `docker-compose.yml` has to include one.
> Without any trusted header, a production API counts every visitor in one shared bucket
> per auth route. On the hosted deployment, Vercel's edge sets `x-forwarded-for`; that it
> reaches the API across the rewrite is still to be checked on a preview.
>
> **M4.** `docker-compose.yml` puts Caddy in front of `web` (`deploy/Caddyfile`). Caddy
> replaces a client's `X-Forwarded-For` with the address it sees. Measured on the
> composed stack: twelve failed sign-ins, each with a different forged header, were
> refused from the eleventh. The per-user submission limits and the 60-writes-per-minute
> limit on `/v1` (`MUTATIONS_PER_MINUTE`) are built. The 300-per-minute limit on public
> reads is not: it would add a database write to every content request, which spec 05
> §5 keeps free of the database. Deciding between the two is open.

> **M5.** User search (30 per minute per address) and avatar uploads (10 per hour per
> user) are built. `/api/auth/change-password` is under the sign-in limit (10 per 10
> minutes per address), since a signed-in session could otherwise guess the current
> password at Better Auth's default 100 per minute. `img-src` adds `AVATAR_ORIGIN` when set.

## 4. Input handling

- Every body, query and path parameter is validated with zod; unknown fields are rejected.
- Size limits: JSON bodies 256 KB; code 64 KB; avatar 2 MB; CV 4 MB.
- Uploads are checked by file signature (magic bytes), not by extension or declared type.
  Avatars are re-encoded to WebP at 256 px, which also strips metadata.
- All SQL goes through Drizzle's query builder or parameterised statements.
- User text (bio, feedback, notes) is stored as plain text and rendered as text.
- The server never fetches a URL supplied by a user.

## 5. Observability

**Logs.** One JSON line per request: request ID, route pattern, status, duration, user ID
if any. Never logged: request bodies, submitted code, cookies, tokens, email addresses.
The request ID is returned in the `X-Request-Id` header and in error bodies.

**Events worth their own log line:** submission created and finished (verdict, sandbox
duration), provider error, ingestion stage changes, step verification results, publish
and archive actions with the acting user, role changes, auth failure bursts, limit or
ceiling hit.

**Metrics to chart:**

| Metric                                                                    | Why                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| Submission time from created to finished, p50 and p95                     | The product's perceived speed                      |
| Share of submissions ending `internal_error`                              | Sandbox health                                     |
| Share of submissions reaped as stale                                      | Whether inline dispatch is reliable enough (07 §3) |
| Sandbox runs and seconds per day                                          | Cost                                               |
| API error rate and p95 latency per route                                  | General health                                     |
| Ingestions: time to ready, share failed, share of steps needing attention | Pipeline health                                    |
| LLM tokens per day, split by feature                                      | Cost                                               |

**Alerts:** `internal_error` share above 5% over 15 minutes; an ingestion stuck in one
stage for over 30 minutes; global submission ceiling reached; API 5xx rate above 2%; database connection
errors.

Error tracking and product analytics tools are optional and are added behind a consent
check if they set cookies.

## 6. Testing

| Layer              | Tool                                                       | Covers                                                                                                         | Runs                                              |
| ------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Unit               | `bun test`                                                 | Services, roles, verdict mapping, content schemas, limiter, pipeline task engine                               | Every push                                        |
| API integration    | `bun test` with `app.request()` and a real Postgres        | Each endpoint: happy path, validation, auth, role, ownership                                                   | Every push                                        |
| Pipeline           | `bun test` with the fake LLM and the `local` runner        | A whole ingestion from upload to draft; repair loop; crash and resume; each check V1–V10 with a planted defect | Every push                                        |
| Pipeline quality   | `pipeline:eval` with the real model                        | The measures in spec 09 §18                                                                                    | By hand, before changing prompts, model or checks |
| Content            | `content:verify`                                           | Every solution passes; every starter fails                                                                     | When content or runner changes                    |
| Contract           | Postman collection in `postman/`, run with the Postman CLI | Deployed preview API matches spec 05                                                                           | Every pull request, after preview deploy          |
| Runner adversarial | Fixed malicious submissions against the real sandbox       | Spec 07 §10                                                                                                    | Nightly, and before image or vendor changes       |
| End-to-end         | Playwright                                                 | Sign-up, run, submit, solved mark, upgrade prompt                                                              | Every pull request, against preview               |
| Accessibility      | axe via Playwright                                         | Key pages have no serious violations                                                                           | Every pull request                                |

Rules:

- Integration tests use a real Postgres, not a mock, with one schema per test file.
- External vendors are faked at the adapter interface in unit and integration tests. Only
  the contract, adversarial and end-to-end suites touch real services, in test mode.
- Each endpoint has at least one test proving another user's resource returns `404`.
- Each maintainer endpoint has a test proving a `user` gets `404`.
- The canary test of spec 03 §9 covers every learner-facing endpoint.
- A bug fix comes with a test that failed before it.

## 7. Continuous integration and deployment

**On every pull request:**

1. `bun install --frozen-lockfile`
2. `lint`, `check-types`, `test`
3. `content:verify` when relevant paths changed
4. `build`
5. Deploy previews of both apps; apply migrations to the preview database and run
   `content:sync` against the preview bucket
6. Postman contract suite and Playwright against the previews

**On merge to `main`:**

1. Steps 1–4 again
2. Apply migrations to production, then `content:sync` against the production bucket
3. Deploy the API, then the web app
4. Smoke test: health endpoint, one content page, one authenticated call with a test user

Order matters. Migrations are backwards-compatible (spec 04 §9), so the old API keeps
working while they apply; the API deploys before the web app so the web app never calls an
endpoint that does not exist yet.

**Rollback.** Redeploy the previous build of the affected app. Migrations are not rolled
back; they are written so the previous build still works against the new schema.

**Content-only changes** go through the same pipeline. Content is part of the build.

## 8. Secrets

- Stored in the hosting platform's environment settings, separately per environment.
- Never committed. `.env*` files other than `.env.example` are git-ignored, as the starter
  already does.
- Production and preview use different database credentials, R2 buckets and tokens, auth
  secrets and LLM keys.
  The preview LLM key has a low spending limit.
- Rotating `BETTER_AUTH_SECRET` signs everyone out; do it deliberately.
- A secret-scanning check runs in CI.

## 9. Data protection

- Personal data held: email, username, optional avatar and bio, submitted code, CVs,
  interview transcripts. There are no payment details: the project takes no payments.
- Users can delete their account and everything attached to it (spec 06 §4).
- A data export (JSON of profile, progress and submissions) is provided on request at
  first, self-service later.
- Only strictly necessary cookies are set by default: the session cookie and a theme
  preference.
- Terms of use and a privacy policy are published before the hosted instance opens. They
  must name the services in spec 01 §8 that receive user data, including that CVs and
  interview text are sent to an LLM provider. Self-hosters publish their own.
- Database backups: daily, retained 7 days, with one restore rehearsed before launch.
- Content backups: the private R2 bucket is copied to a second bucket on a schedule.
  Versions are immutable and the index keeps its history, so the realistic loss is an
  accidental bucket deletion; the copy covers that. A restore of both database and bucket
  is rehearsed together, because progress rows refer to paper IDs in storage.

## 10. Launch checklist

- [ ] Runner adversarial suite passes against the production sandbox
- [ ] CSP enforced, not report-only
- [ ] No docs or debug endpoint reachable in production
- [ ] Rate limits verified from outside, including the client-IP handling
- [ ] Every `/v1/admin` route returns `404` to an ordinary user
- [ ] Global submission ceiling and alerts configured
- [ ] Backup restore rehearsed
- [ ] Terms and privacy policy live
- [ ] Pipeline run end to end on the production instance; token budget and limits confirmed
- [ ] Licence and community files present; no secrets in git history
- [ ] Self-hosting quick start tested on a clean machine
- [ ] An admin account exists; seed users do not
