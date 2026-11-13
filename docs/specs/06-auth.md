# 06 — Auth

Accounts, sessions and authorisation. Built on **Better Auth**, mounted inside the Hono
app, storing its data in Postgres through the Drizzle adapter.

Why a library: password hashing, OAuth, reset tokens, session rotation and cookie handling
are easy to get subtly wrong and add no product value when hand-written.

Option names below are pointers. Confirm exact spellings in the Better Auth docs for the
installed version before configuring.

## 1. Sign-in methods

| Method           | Notes                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Email + password | Always available. Minimum 8 characters, maximum 128. Email verification required before running code, when the instance has an email sender. |
| Google           | Available when the instance has Google credentials. OAuth redirect flow. Email is treated as verified.                                       |

A self-hosted instance with no email sender and no Google credentials still works: users
sign up with email and password and verification is skipped (spec 13 §4). Password reset
by email is then unavailable; an admin resets a password from the command line.

The reference site obtains a Google ID token in a popup and posts it to its backend. We
use the standard redirect flow instead, so no Google script runs on our pages and the
Content-Security-Policy stays strict.

Account linking: if a Google sign-in arrives with an email that already has a password
account, the accounts are linked only when the existing email is verified.

## 2. Configuration

| Setting             | Value                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Base URL            | `WEB_ORIGIN` — the public site, because the browser reaches auth routes through the proxy |
| Base path           | `/api/auth`                                                                               |
| Database            | Drizzle adapter, Postgres                                                                 |
| Trusted origins     | `WEB_ORIGIN` only                                                                         |
| Session lifetime    | 30 days, extended on use at most once per day                                             |
| Session cookie      | `HttpOnly`, `Secure`, `SameSite=Lax`, host-only (no `Domain` attribute)                   |
| Cookie cache        | Enabled, 5 minutes — avoids a database read on most requests                              |
| Username plugin     | Enabled                                                                                   |
| Extra user field    | `role`: `user` (default), `maintainer` or `admin`; not settable by the client             |
| Rate limiting       | Enabled, with database storage (in-memory storage is wrong on serverless)                 |
| Google redirect URI | `${WEB_ORIGIN}/api/auth/callback/google`                                                  |

Because of the same-origin proxy (spec 01 §4.2), the cookie is first-party. No
cross-subdomain or `SameSite=None` configuration is needed.

## 3. Usernames

- 3–20 characters, `a–z`, `0–9`, `_`. Stored lowercase. Unique.
- A reserved list blocks route names and impersonation targets (`admin`, `api`, `settings`,
  `support`, …). The list lives in `packages/shared`.
- Password sign-up asks for a username.
- Google sign-up generates one from the email's local part, sanitised, with a numeric
  suffix on collision. The user can change it in settings.
- Changing a username is allowed at most once every 30 days.

## 4. Flows

### Sign-up with email

1. Client submits email, password, username.
2. Better Auth creates `user` and `account`; an after-create hook inserts `profiles` and
   `user_stats` (spec 04 §5.2).
3. A verification email is sent. The user is signed in immediately but restricted.
4. Following the link verifies the email and redirects to `/papers`.

Until verified, the user can browse and edit code but `POST /v1/submissions` returns
`403 email_not_verified`. The UI shows a banner with a "resend" action.

### Password reset

1. Client submits an email to the reset-request endpoint.
2. The response is always the same generic success, whether or not the account exists.
3. If it exists, an email with a single-use link valid for 1 hour is sent.
4. The link opens `/reset-password?token=…`; submitting a new password invalidates all of
   the user's sessions.

### Sign-out

Deletes the session row and clears the cookie.

### Account deletion

`DELETE /v1/me` with the username as confirmation. Deletes the user's storage objects,
then the `user` row. Papers the user published stay; their `created_by` becomes null.

## 5. Email

Sent through an `EmailSender` adapter with three drivers: `resend`, `smtp`, and `log`
(prints to the console; the default in development). Three templates: verify email, reset
password, and "your paper is ready for review" for maintainers. Plain, text-first HTML.

## 6. Middleware in the API

| Middleware             | Behaviour                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `session()`            | Resolves the session from the cookie and sets `c.var.user` and `c.var.session`, or `null`. Runs on every `/v1` route. Never rejects.        |
| `requireAuth()`        | `401 unauthenticated` when there is no user                                                                                                 |
| `requireVerified()`    | `403 email_not_verified` when the email is unverified                                                                                       |
| `requireRole(role)`    | `404 not_found` when the user's role is lower, so maintainer and admin routes are not discoverable. Order: `user` < `maintainer` < `admin`. |
| `requireFeature(name)` | `404 not_found` when the feature is off on this instance (spec 13 §4)                                                                       |
| `originCheck()`        | For non-GET requests, rejects when `Origin` is present and is not `WEB_ORIGIN`                                                              |

There is no plan or tier check anywhere. Access depends only on sign-in state, email
verification and role.

## 7. Cross-site request forgery

Three layers:

1. The session cookie is `SameSite=Lax`, so it is not sent on cross-site `POST`s.
2. `originCheck()` rejects state-changing requests from other origins.
3. Mutating routes accept only `application/json` (or `multipart/form-data` for uploads),
   which a plain cross-site HTML form cannot send with credentials.

Internal routes (`/api/internal/*`) carry no session and are authenticated by a bearer
secret instead.

## 8. In the web app

- A Better Auth React client provides `useSession()`, sign-in, sign-up and sign-out calls.
- `GET /v1/me` provides profile and role; it is fetched once the session exists and
  cached with TanStack Query. `GET /v1/config` says which sign-in methods to offer.
- Sign-in is offered both as a **modal** (opened from any page, preserving what the user
  was doing) and as **pages** (`/login`, `/signup`, `/reset-password`) for email links and
  direct navigation.
- No session token or user object is stored in `localStorage`.
- Pages that need a session render a signed-out state with a sign-in prompt. Server
  Components in `apps/web` do not read the session; all per-user data is fetched in the
  browser. This keeps content pages static.

## 9. Authorisation model

| Actor            | Can                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Anonymous        | Read every published paper and problem, the leaderboard and public profiles                     |
| User, unverified | Also: edit own profile                                                                          |
| User, verified   | Also: run and submit code, follow users, use every enabled feature within the instance's limits |
| Maintainer       | Also: upload papers to the pipeline, review, edit, publish and archive content                  |
| Admin            | Also: change roles and instance settings                                                        |

Becoming an admin:

- Addresses listed in `ADMIN_EMAILS` receive `admin` when they sign up. Their email must
  be verified first if the instance verifies emails.
- `bun run admin:grant <email> <role>` sets a role from the command line.
- An admin can change another user's role through `PATCH /v1/admin/users/:id`. An admin
  cannot demote themselves if they are the last admin.

## 10. Acceptance checks

- A session cookie is not readable from JavaScript.
- Signing in on a preview deployment works without configuration changes beyond
  environment variables.
- A request to reset the password for an unknown email is indistinguishable, in response
  and timing class, from one for a known email.
- An unverified user receives `403 email_not_verified` on submission, on an instance that
  verifies emails.
- A `user` calling any `/v1/admin` route receives `404`.
- A fresh instance with only `ADMIN_EMAILS` set yields a working admin on first sign-up.
- Deleting an account removes every row that references it.
