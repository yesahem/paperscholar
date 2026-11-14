# 05 — API

The contract between `apps/web` and `apps/backend`. Request and response shapes below are
written as TypeScript types; the real definitions are zod schemas in `packages/shared`.

## 1. Basics

|                        |                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path              | `/api`                                                                                                                                                                                |
| Application routes     | `/api/v1/...`                                                                                                                                                                         |
| Auth routes            | `/api/auth/...` — owned by Better Auth (spec 06); errors are Better Auth's `{ code, message }`, not the envelope below. Responses still carry `X-Request-Id`, and 429s `Retry-After`. |
| Format                 | JSON, UTF-8, `camelCase` keys                                                                                                                                                         |
| Authentication         | Session cookie. No bearer tokens.                                                                                                                                                     |
| Time                   | ISO 8601 UTC strings                                                                                                                                                                  |
| Unknown request fields | Rejected (`validation_error`)                                                                                                                                                         |

## 2. Application skeleton

```ts
// apps/backend/src/create-app.ts (M0 shape; later milestones add the commented parts)
const app = new Hono<AppEnv>();

app.use(
  "*",
  requestId(),
  requestContext(logger),
  requestLogger(),
  secureHeaders(),
  defaultCacheControl(),
  limitBody(),
);
app.onError(createErrorHandler(logger)); // AppError, Hono errors and unknown errors → §3
app.notFound(notFoundHandler);

const api = new Hono<AppEnv>().route("/health", healthRoutes({ version }));
// .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
// .route("/v1", v1)   where v1 = new Hono().use(originCheck(), session()).route(...)

app.route("/api", api);
```

- Every route reads input through `validate(target, schema)` (`apps/backend/src/lib/validation.ts`),
  which wraps `zValidator` and throws `validation_error` with every issue. Malformed JSON is
  a `validation_error`, never a 500.
- Handlers are chained on the router (`.get(...).post(...)`) so route types are inferred
  for the typed client.
- Tests call `app.request(...)` directly, with no network.

### Typed client

`apps/web` calls the API through `fetchJson(url, schema)` (`apps/web/lib/api/fetch-json.ts`),
parsing every response with the zod schema from `packages/shared` that the backend's
handlers are typed against. One schema is the contract on both sides, and the web app
validates what it receives, as AGENTS.md §1 requires.

> **Changed in M2.** The spec first proposed `hc<AppType>()` from `hono/client`. Importing
> `AppType`, even as a type, makes the web app's type-check load the backend's whole module
> graph (Bun, Drizzle, storage drivers), and `hc` does not validate responses. Browser
> code imports zod-free modules (`@repo/shared/vocabulary`, `@repo/shared/site`) and
> validates with `zod/mini`, so the full zod build stays out of the page bundle.

## 3. Errors

Every non-2xx response has this body:

```ts
type ErrorBody = {
  error: {
    code: string; // stable, machine-readable
    message: string; // safe to show to the user
    details?: unknown; // code-specific
    requestId: string;
  };
};
```

| HTTP | `code`                   | When                                                | `details`                                            |
| ---- | ------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| 400  | `validation_error`       | Body, query or params failed validation             | `{ issues: [{ path, message }] }`                    |
| 401  | `unauthenticated`        | No valid session                                    | —                                                    |
| 403  | `forbidden`              | Authenticated but not allowed                       | —                                                    |
| 403  | `email_not_verified`     | Action needs a verified email                       | —                                                    |
| 404  | `not_found`              | Resource does not exist, or exists but is not yours | —                                                    |
| 409  | `conflict`               | State conflict, e.g. username taken                 | `{ availableAt }` when a username change is too soon |
| 409  | `submission_in_progress` | A run is already queued or running                  | `{ submissionId }`                                   |
| 413  | `payload_too_large`      | Body over the limit                                 | `{ maxBytes }`                                       |
| 429  | `rate_limited`           | Too many requests in the window                     | `{ retryAfterSeconds }`                              |
| 429  | `quota_exceeded`         | Daily or plan quota used up                         | `{ resetsAt }`                                       |
| 500  | `internal_error`         | Unexpected failure                                  | —                                                    |
| 503  | `upstream_unavailable`   | A vendor we depend on is down                       | —                                                    |

Rules:

- A resource belonging to another user returns `404`, not `403`, so IDs cannot be probed.
- `message` never contains stack traces, SQL or vendor error text.
- `429` responses carry a `Retry-After` header.

## 4. Lists and caching

- Lists return `{ items: T[], nextCursor: string | null }`. `limit` defaults to 20, maximum 100. `cursor` is opaque.
- The leaderboard is the exception: it uses `offset`, because a rank is a position.
- Public content responses send
  `Cache-Control: public, s-maxage=20, stale-while-revalidate=86400` and a strong `ETag`,
  a digest of the body, and answer a matching `If-None-Match` with `304`. A digest
  changes exactly when the response does, including when a paper's status changes
  without a new version.
- **Freshness budget.** A content change reaches every page within a minute: the API
  revalidates its cached `index.json` after 10 s, shared caches keep a response for 20 s,
  and the web app revalidates content pages every 30 s. Measured in M2: unpublishing a
  paper left the catalogue after 12 s; republishing it showed after 27 s.
- Everything that depends on the session sends `Cache-Control: private, no-store`.

## 5. Endpoints — content (milestone 2)

Public, no session needed. Served from object storage through the content cache
(spec 03 §2.3); no database query. Only `published` papers and problems are returned. Responses
are built from explicit field lists and never include solutions, tests or helper source
(spec 03 §9).

### `GET /v1/papers`

```ts
type PaperSummary = {
  id: string; title: string; authors: string[]; year: number;
  summary: string; url: string; tags: string[];
  problemCount: number;
  difficultyCounts: { easy: number; medium: number; hard: number };
};
// 200
{ items: PaperSummary[] }
```

### `GET /v1/papers/:paperId`

```ts
type ProblemSummary = {
  id: string; title: string; summary: string;
  difficulty: Difficulty; type: ProblemType; order: number;
};
// 200
PaperSummary & { problems: ProblemSummary[] }
```

### `GET /v1/papers/:paperId/problems/:problemId`

```ts
type ProblemDetail = ProblemSummary & {
  paperId: string;
  description: string; // markdown
  tutorial: string | null; // markdown
  starter: string; // python
  entryPoint: string;
  environment: RunEnvironment;
  allowedPackages: string[];
  prohibitedImports: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
};
```

Also includes `paperRefs: string[]` and `helpersInterface: string | null`: the helpers'
public function and class signatures with their docstrings, bodies replaced by `...`,
extracted when the paper is published and stored in `public.json`. `null` without helpers.

`year` is `number | null` (unknown years exist). A problem's `order` is its 1-based
position among the paper's **published** problems, so retiring one renumbers the rest
without gaps. Lists are sorted by title.

Every published problem is public and cacheable. Nothing is gated by plan.

### `GET /v1/tracks`

`{ items: { id, title, summary, paperIds: string[] }[] }`

### `GET /v1/stats`

`{ totalUsers: number, totalSolves: number }`. Cached for 10 minutes.

## 6. Endpoints — submissions (milestone 4)

All require a session with a verified email.

### `POST /v1/submissions`

```ts
// request
{
  paperId: string;
  problemId: string;
  code: string;
  mode: "run" | "submit";
}
// 202
{
  id: string;
  status: "queued";
}
```

Checks, in this order:

1. Session present and email verified.
2. `code` is non-empty and at most 64 KB.
3. The problem exists and is published → else `404`.
4. Rate limit and daily limit (spec 11 §3) → else `429`.
5. No other submission in flight → else `409 submission_in_progress`.

Email verification is skipped on instances that have it switched off (spec 13 §4).

> **Built in M4.** Code is measured in UTF-8 bytes, and whitespace-only code is empty;
> both are `validation_error`. A `429 rate_limited` carries `{ retryAfterSeconds }`, a
> `429 quota_exceeded` `{ resetsAt }` (the next midnight UTC), and both `Retry-After`.
> Past the global ceiling the answer is `503 upstream_unavailable`.

### `GET /v1/submissions/:id`

Owner only.

```ts
type TestResult = {
  name: string; // "test_output_has_shape_seq_len_by_d_model"
  group: "public" | "hidden";
  status: "passed" | "failed" | "error";
  durationMs: number;
  message: string | null; // short failure message
  traceback: string | null; // public tests only
  stdout: string | null; // public tests only, truncated
};

type Submission = {
  id: string;
  paperId: string;
  problemId: string;
  mode: SubmissionMode;
  status: SubmissionStatus;
  verdict: Verdict | null;
  testsPassed: number | null;
  testsTotal: number | null;
  tests: TestResult[] | null;
  violations: string[] | null; // offending modules, for import_violation
  errorOutput: string | null; // e.g. a syntax error, for runtime_error
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
  code: string;
};
```

While `status` is `queued` or `running`, the result fields are `null`. Clients poll this
endpoint (spec 07 §3).

### `GET /v1/submissions?paperId=&problemId=&mode=&limit=&cursor=`

The caller's own history, newest first. Items are `Submission` without `code`, `tests`,
`violations` and `errorOutput`. `problemId` requires `paperId`. The cursor encodes the
last item's creation time and id.

## 7. Endpoints — progress, profile, social (milestone 5)

| Method and path                            | Auth     | Returns                                                                            |
| ------------------------------------------ | -------- | ---------------------------------------------------------------------------------- |
| `GET /v1/progress`                         | Yes      | `{ items: { paperId, problemId, solvedAt }[] }` — all of the caller's solves       |
| `GET /v1/me`                               | Yes      | `Me` (below)                                                                       |
| `PATCH /v1/me`                             | Yes      | Update `username` and/or `bio`; returns `Me`                                       |
| `DELETE /v1/me`                            | Yes      | Deletes the account; requires `{ confirm: "<username>" }`                          |
| `POST /v1/me/avatar`                       | Yes      | `multipart/form-data`, one image ≤ 2 MB (JPEG, PNG, WebP); returns `{ avatarUrl }` |
| `DELETE /v1/me/avatar`                     | Yes      | `204`                                                                              |
| `GET /v1/users/:username`                  | Optional | `PublicProfile` (below)                                                            |
| `PUT /v1/users/:username/follow`           | Yes      | `204`, idempotent                                                                  |
| `DELETE /v1/users/:username/follow`        | Yes      | `204`, idempotent                                                                  |
| `GET /v1/users/:username/following`        | No       | Paginated `{ username, avatarUrl }[]`                                              |
| `GET /v1/users?q=`                         | No       | Up to 10 users by username prefix; `q` ≥ 2 characters                              |
| `GET /v1/leaderboard?sort=&limit=&offset=` | No       | `LeaderboardPage` (below)                                                          |
| `GET /v1/leaderboard/me?sort=`             | Yes      | `{ rank: number \| null }`                                                         |

```ts
type Me = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  bio: string | null;
  role: Role;
  createdAt: string;
};

type PublicProfile = {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string;
  stats: {
    problemsSolved: number;
    papersCompleted: number;
    easy: number;
    medium: number;
    hard: number;
    currentStreak: number;
    longestStreak: number;
  };
  papers: {
    paperId: string;
    solved: number;
    total: number;
    completedAt: string | null;
  }[];
  activity: { day: string; solves: number }[]; // last 365 days, days with activity only
  followingCount: number;
  followerCount: number;
  isFollowedByMe: boolean | null; // null when signed out
};

type LeaderboardPage = {
  sort: "problems_solved" | "papers_completed" | "recent_activity";
  items: {
    rank: number;
    username: string;
    avatarUrl: string | null;
    problemsSolved: number;
    papersCompleted: number;
    lastSolvedAt: string | null;
  }[];
  total: number;
};
```

`PATCH /v1/me` (M3): `username` is lowercased and checked against spec 06 §3; a taken
name is `409 conflict`, and a second change within 30 days is `409 conflict` with
`details.availableAt`. An empty `bio` clears it. `DELETE /v1/me` with a confirmation
that is not the username is `400 validation_error` and changes nothing; on success it
answers `204` with headers that clear the session cookies. Unknown fields, such as `role`,
are rejected.

Public profile responses never contain email or role. Users with zero solves
are not listed on the leaderboard.

## 8. Endpoints — instance and maintainers

### `GET /v1/config` (milestone 2)

Public. Tells the web app what this instance offers (spec 13 §4).

```ts
{
  features: {
    pipeline: boolean;
    coldMail: boolean;
    interview: boolean;
    courses: boolean;
    listings: boolean;
    googleSignIn: boolean;
    emailVerification: boolean;
    passwordReset: boolean; // added in M3
    signups: boolean;
  }
  limits: {
    runsPerDay: number;
    codeBytes: number;
  }
  version: string;
}
```

A request to an endpoint of a feature that is off returns `404 not_found`.

A feature is on only when the build contains it **and** the instance is configured for
it; each becomes configurable in the milestone that builds it (spec 12). From M3,
`signups`, `emailVerification`, `passwordReset` and `googleSignIn` follow the
configuration; the rest stay off until their milestones. `passwordReset` is separate from
`emailVerification` because an instance can send email while not requiring verification. `limits.runsPerDay` comes from `RUNS_PER_DAY` (default 100) and
`limits.codeBytes` is 65 536. The response is public and cached like content.

### Maintainer endpoints (milestone 6)

All under `/v1/admin`, all requiring role `maintainer` or `admin`; everyone else receives
`404 not_found`.

| Method and path                                      | Purpose                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/v1/admin/ingestions/...`                           | The paper pipeline. Full list in spec 09 §16.                                   |
| `GET /v1/admin/papers`                               | All papers including drafts and archived, with source and status                |
| `GET /v1/admin/papers/:paperId`                      | A paper with every part of every problem, **including private parts**           |
| `PATCH /v1/admin/papers/:paperId`                    | Edit metadata; reorder problems                                                 |
| `PUT /v1/admin/papers/:paperId/problems/:problemId`  | Submit edited files as a candidate; verification starts → `202 { candidateId }` |
| `GET /v1/admin/candidates/:id`                       | Candidate status and check results                                              |
| `POST /v1/admin/papers/:paperId/publish`, `/archive` | Change status (publish rules in spec 09 §11)                                    |
| `DELETE /v1/admin/papers/:paperId`                   | Drafts only                                                                     |

Admin only:

| Method and path             | Purpose    |
| --------------------------- | ---------- |
| `GET /v1/admin/users?q=`    | Find users |
| `PATCH /v1/admin/users/:id` | `{ role }` |

There are no billing endpoints.

## 9. Endpoints — later milestones

Specified in spec 10. Paths reserved here so naming stays consistent.

| Area      | Paths                                                                                                         | Milestone |
| --------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| Quizzes   | `/v1/exams/topics`, `/v1/exams/attempts`, `/v1/exams/attempts/:id/submit`                                     | 7         |
| Listings  | `/v1/listings`, `/v1/professors`                                                                              | 7         |
| Feedback  | `/v1/feedback`, `/v1/feedback/:id`                                                                            | 7         |
| Courses   | `/v1/courses`, `/v1/courses/:id`, and under `.../items/:itemId/`: `playback`, `exercise`, `progress`, `notes` | 8         |
| Cold mail | `/v1/cv`, `/v1/cold-mails`                                                                                    | 9         |
| Interview | `/v1/interviews`, `/v1/interviews/:id/messages`, `.../complete`, `.../feedback`                               | 10        |

## 10. Internal endpoints

| Method and path                    | Auth                                     | Purpose                                                                                           |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/health`                  | None                                     | `{ ok: true, version }`. No database call.                                                        |
| `POST /api/csp-report`             | None                                     | Content-Security-Policy violation reports from browsers (spec 11 §2). Logs a reduced form; `204`. |
| `POST /api/internal/cron/cleanup`  | `Authorization: Bearer $INTERNAL_SECRET` | Daily: reap stuck submissions, apply retention (04 §8). Also `GET`, which Vercel Cron sends.      |
| `POST /api/internal/pipeline/tick` | `Authorization: Bearer $INTERNAL_SECRET` | Runs pipeline tasks (09 §13). Serverless mode only; self-hosted instances use the worker process. |

> **Built in M4.** Without `INTERNAL_SECRET` the internal endpoints answer 404. On Vercel,
> `CRON_SECRET` is set to the same value so Vercel Cron sends it; self-hosted instances
> run the same cleanup from the `worker` process instead.

There is no OpenAPI or docs endpoint in production. A generated OpenAPI document MAY be
served in local development.

## 11. The contract as a runnable collection

From milestone 2 the API contract is also kept as a Postman collection in `postman/`,
alongside environments for local and preview. Each endpoint has at least one request with
assertions on status and response shape. The collection is run in CI against the preview
API with the Postman CLI (spec 11 §6). When an endpoint changes, the schema in
`packages/shared`, the collection, and this document change in the same pull request.
