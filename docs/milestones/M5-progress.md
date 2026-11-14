# M5 — Progress, profile, leaderboard

**Status:** done locally, on branch `feat/m5-progress` (stacked on M4). Avatars with R2 were
checked against the S3-compatible server in `docker-compose.dev.yml`, not against Cloudflare
(see [Not done](#not-done)).
**Spec:** [`docs/specs/12-milestones.md`](../specs/12-milestones.md) §M5.

## Summary

Solving now counts. A passed **Submit** records the solve, the paper's completion when it
was the last step, the day's activity and the streak, in the same transaction that stores
the verdict. Solved ticks, progress bars and a "Continue with step N" button appear on the
catalogue, paper pages, the roadmap and the workspace. There is a leaderboard with three
sorts and your own rank pinned, public profiles with stat tiles, a 52-week heatmap,
per-paper progress and follows, and a settings page for username, bio, avatar, password and
account deletion.

## What was built

### Database (`packages/db`)

Migration `0005_progress.sql`: `progress`, `paper_completions`, `user_stats`,
`daily_activity` and `follows` as in spec 04 §4, with the three leaderboard indexes,
`follows_by_followee`, a `CHECK` on difficulty and `follows_not_self_check`. `@repo/db` now
also exports a `Transaction` type and `asc`, `gt`, `AnyColumn`, `SQL`.

### API (`apps/backend`)

| Endpoint                                       | What                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/v1/progress`                         | The caller's solves, oldest first                                          |
| `GET /api/v1/leaderboard?sort=&limit=&offset=` | Public; 3 sorts, each an index order; users with no solves are not listed  |
| `GET /api/v1/leaderboard/me?sort=`             | The caller's position, or `null`                                           |
| `GET /api/v1/users/:username`                  | Public profile; never email or role; `isFollowedByMe` null when signed out |
| `PUT`/`DELETE /api/v1/users/:username/follow`  | Idempotent; confirmed email where the instance verifies; not yourself      |
| `GET /api/v1/users/:username/following`        | Paged, newest first                                                        |
| `GET /api/v1/users?q=`                         | Up to 10 usernames by prefix; 30 per minute per address                    |
| `POST`/`DELETE /api/v1/me/avatar`              | Upload (multipart field `avatar`, ≤ 2 MB, 10 per hour) and remove          |
| `GET /api/avatars/:userId/:file`               | Serves avatars kept by the `fs` driver, cached for a year                  |

- **The solve transaction** (`services/progress.ts`, `recordFinished`), called from
  `submissions.execute` inside the transaction that stores the result. Steps 1–5 of spec
  04 §5.1; the stats row is upserted and locked `for update` while counters and streak
  change. `internal_error` records nothing; a run reaped while running records nothing.
- **Leaderboard** (`services/leaderboard.ts`): `ORDER BY` written to match each index
  exactly. A rank is computed in SQL against the user's own row, so timestamps are compared
  at full precision.
- **Profiles** (`services/profiles.ts`): per-paper totals come from the cached index
  (published problems now); a streak whose last day is before yesterday reads as 0; the
  heatmap counts passing submits per UTC day for the last 365 days.
- **Avatars** (`services/avatars.ts`, `adapters/avatar-store.ts`): the format is read from
  the file's first bytes; Bun's built-in `Bun.Image` refuses more than 40 megapixels before
  decoding and re-encodes to WebP of at most 256 px, which drops metadata. No native
  dependency was added. Each upload gets a new immutable key and the old file is deleted;
  deleting the account deletes the file.
- **Daily cleanup** now also runs the drift check of spec 04 §5.2 over 200 random users
  and logs each disagreeing counter.
- The sign-up hook creates the `user_stats` row; writers upsert it anyway.
- `/api/auth/change-password` joins the sign-in rate limit (10 per 10 minutes per address).
- The body limit stays 256 KB except on the avatar path (2 MB + 64 KB of framing).
- Cursor helpers moved to `lib/cursor.ts`; `lib/client-ip.ts` reads the client address with
  Better Auth's own parser (`@better-auth/core` 1.7.22 is now a direct dependency).
- **New variables:** `R2_PUBLIC_BUCKET`, `R2_PUBLIC_URL` (required with `r2`), in
  `apps/backend/.env.example`, the root `.env.example` and `docker-compose.yml`.

### Shared (`packages/shared`)

`@repo/shared/progress` (zod-free, for the browser): sorts, page sizes, search and avatar
limits. `http/progress.ts`: every request and response schema of spec 05 §7.

### UI (`packages/ui`)

`Avatar`: an image cropped to a circle, falling back to the user's initial when there is
none or it fails to load; `decorative` hides it from screen readers beside a visible name.

### Web (`apps/web`)

- **Solved marks and progress** (`components/progress/`): ticks on paper pages, a "Solved"
  badge in the workspace heading, "N of M solved" bars on catalogue cards, paper pages and
  the roadmap, and a button that reads Start / Continue with step N / Review. All fill in
  from `GET /v1/progress` in the browser, so the pages stay cached for everyone. A passed
  submit invalidates progress, profiles and rankings; the marks update without a reload.
- **`/leaderboard`**: sort tabs (arrow keys work, the view is in `?sort=&page=`), 50 per page,
  your rank pinned with "Show my place", your row marked "(you)", and user search.
- **`/profile/[username]`**: avatar, bio (plain text), join date, follower counts, follow
  button (optimistic, rolled back on failure), stat tiles, heatmap with its total in text,
  per-paper cards, following list. `/profile` redirects to your own or to sign-in.
- **`/settings`**: username and bio, avatar with a preview before upload, password change
  (signs out other devices), delete account behind a typed username.
- Header: Leaderboard in the navigation; the account menu shows your avatar and links to
  your profile and settings.
- Every new view has loading skeletons, empty states, error states with retry and a
  signed-out state (spec 08 §8).
- **New variable:** `AVATAR_ORIGIN` (optional), added to the image policy when avatars are
  served from the R2 public bucket. Passed as a build argument by `docker-compose.yml`.

### Postman

A `progress` folder (16 requests): signed-out 401, leaderboard and its 400, own progress
and rank, own profile without email or role, 404, search, follow refusal, following,
avatar upload from `postman/fixtures/avatar.png`, refusal and removal, deletion.

## How to run it

```sh
bun run db:migrate         # adds the M5 tables
bun dev                    # then sign up, submit a reference solution, open /leaderboard
bun run api:contract       # from the repository root (the avatar fixture path is relative to it)
```

## Verification

All on macOS (arm64), Bun 1.3.14, against the Postgres of `docker-compose.dev.yml`.

| Check                                                                                 | Result                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format:check`, `lint` (10 workspaces), `check-types`                                 | Pass                                                                                                                                                                                                                                                                                                                                                             |
| `bun run test`                                                                        | 502 pass: backend 211, web 72, shared 54, `@repo/runner` 43, content 36, ui 26, storage 26, runner service 20, pipeline 9, db 5                                                                                                                                                                                                                                  |
| Backend tests under `TZ=Pacific/Kiritimati` (UTC+14)                                  | 211 pass                                                                                                                                                                                                                                                                                                                                                         |
| `bun run build`                                                                       | Pass                                                                                                                                                                                                                                                                                                                                                             |
| First pass increments stats exactly once; passing again changes only the day's counts | Integration tests on real Postgres through `createSubmissions` (`test/services/progress.test.ts`)                                                                                                                                                                                                                                                                |
| Solving every published problem records one completion                                | Integration test, two papers; and in the browser (Adam, both steps)                                                                                                                                                                                                                                                                                              |
| Leaderboard order matches a direct query over `progress`                              | Integration test, all three sorts, with ties; and on the live dev database after the browser run: identical                                                                                                                                                                                                                                                      |
| Every rank equals the position on the board                                           | Integration test, every user, every sort                                                                                                                                                                                                                                                                                                                         |
| Public profiles expose no email                                                       | Service, route, Postman and browser checks; also no `role`                                                                                                                                                                                                                                                                                                       |
| Avatars with the `fs` driver                                                          | Route tests (upload, serve, replace, remove, refuse, 413, 429, deleted with the account); browser: the header avatar loads from `/api/avatars/…`                                                                                                                                                                                                                 |
| Avatars with `r2`                                                                     | Adapter against versitygw (S3-compatible): put, signed read identical bytes as `image/webp`, delete twice; with a public-read bucket policy an anonymous GET of the public URL answers 200                                                                                                                                                                       |
| Postman contract, verification off                                                    | 46 requests, 167 assertions, 0 failed                                                                                                                                                                                                                                                                                                                            |
| Postman contract, verification on                                                     | 41 requests, 150 assertions, 0 failed                                                                                                                                                                                                                                                                                                                            |
| Browser, production build (17 checks)                                                 | 17 of 17: signed-out states, sign-up, two Submits to "Solved" with the badge appearing without reload, ticks, Continue/Review button, catalogue and roadmap bars, pinned rank, arrow-key sort, profile stats and heatmap, bio as plain text, avatar preview and upload, follow persists, not-found profile, search, typed deletion, no sideways scroll at 375 px |
| Drift check over every user of the dev database                                       | 0 rows                                                                                                                                                                                                                                                                                                                                                           |
| JavaScript per page (gzipped scripts, cold cache)                                     | Content pages 213–215 KB (M4: 222–225); leaderboard 213, profile 220, settings 221; workspace 233 KB before Monaco                                                                                                                                                                                                                                               |

## Bugs found and fixed

- **The leaderboard scrolled sideways on phones.** The grid column grew to the table's
  width instead of letting the table scroll in its box. Found by the 375 px browser check;
  fixed with `min-w-0`.

## Deviations from the specs

All are reflected in the specs in this change.

1. **`created_at`/`updated_at` on `user_stats` and `daily_activity` (04 §4)**, following the
   conventions of 04 §2.
2. **The heatmap counts passing submits (04 §5.2, 05 §7).** `activity[].solves` is
   `passed_submits`, the days streaks count.
3. **`avatarUrl` is same-origin with `fs` (05 §7, §10).** `/api/avatars/<userId>/<id>.webp`,
   served by the API; with `r2` it is `R2_PUBLIC_URL/avatars/…`.
4. **Profiles and the leaderboard are `private, no-store` (05 §4).** They are cheap index
   reads, and a solve should show at once; shared caching can come later if needed.
5. **Avatars are not cropped (11 §4).** Bun's image API resizes but has no crop, so the
   image keeps its shape within 256 px and the circle crops it on screen (`object-cover`).
6. **`/change-password` is rate-limited like sign-in (11 §3)**, which the spec did not list.
7. **Web variable `AVATAR_ORIGIN` (02)** for the image policy.
8. A profile for an unknown username shows a not-found state with HTTP 200, because the
   page shell is the same for everyone and the data loads in the browser (08 §1, §6).

## Things to know

- **`Bun.Image` needs Bun ≥ 1.3.14 where the API runs.** The Docker images pin it. On Vercel,
  the Bun runtime's version must be checked on a preview before avatars are turned on there.
- **Usernames in avatar keys are not involved**: keys use the user id, so a username change
  keeps the avatar.
- **The drift check only logs.** Fixing drift, should it ever appear, is a manual step.
- **Retired problems:** a solve of a retired problem still counts in `problems_solved`; the
  per-paper bars count only problems published now.
- **The browser checks** ran from outside the repository with `puppeteer-core` and the
  local Chrome, as in M2–M4. Playwright in the repository (spec 11 §6) is still to do.

## Not done

- **Avatars on real Cloudflare R2**: needs the public bucket, its URL and the token's access
  to it in the maintainer's account (with the other R2 resources pending since M1).
- **`GET /v1/stats`** (spec 05 §5, `totalUsers`, `totalSolves`): not part of M5's scope and
  not built; `user_stats` now makes it a single aggregate.
- **`bun run db:seed`** (spec 04 §9, "a little progress"): still not written.
- Still pending from earlier milestones: preview deployments, the hosted sandbox, Google
  sign-in end to end, the public-read rate limit decision.

## Ready for M6

`recordFinished` takes a paper's published problem ids from the index, so papers published
by the pipeline count towards completions without further work. The maintainer screens can
reuse `Avatar` and the states in `components/states/`.
