# M2 — Read API and content pages

**Status:** done locally, on branch `feat/m2-read-api` (stacked on M1). Running the Postman
collection against a preview deployment is pending, because no preview deployment exists
yet (see [Not done](#not-done)).
**Spec:** [`docs/specs/12-milestones.md`](../specs/12-milestones.md) §M2.

## Summary

The site is now usable for reading and writing code. The API serves the published papers,
problems, tracks and instance configuration from object storage, with no database. The web
app has a landing page, a filterable catalogue, paper pages, a roadmap, about, terms and
privacy pages, and the problem workspace. The workspace has server-rendered maths and
code, a self-hosted Monaco editor and drafts that survive a reload. Content changes reach
the site within a minute without a rebuild. The API contract is also a Postman collection
that CI runs.

## What was built

### API (`apps/backend`)

| Endpoint                                   | What                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `GET /api/v1/papers`                       | Published papers by title, with problem counts and the difficulty mix |
| `GET /api/v1/papers/:paperId`              | A paper with its published problems, numbered 1, 2, 3… without gaps   |
| `GET /api/v1/papers/:paperId/problems/:id` | What the workspace needs; helper **signatures only**                  |
| `GET /api/v1/tracks`                       | Tracks with their published papers; empty tracks dropped              |
| `GET /api/v1/config`                       | Features (all off until their milestones), limits, version            |
| `POST /api/csp-report`                     | Browser CSP reports, logged without query strings or full URLs        |

- **Read-only content store.** The server opens `ContentStore` with
  `createReadOnlyLock()`, so it needs no database and any write fails loudly. It revalidates
  `index.json` every 10 s by etag.
- **Allow-listed responses.** `services/content-catalog.ts` builds every response field
  by field. Private documents are never opened on these paths.
- **Caching.** Public responses send `Cache-Control: public, s-maxage=20,
stale-while-revalidate=86400` and a strong ETag (a digest of the body), and answer
  `If-None-Match` with `304`; 304s keep their `X-Request-Id`. Errors stay `private,
no-store`.
- **Failure mapping.** An unreachable store returns `503 upstream_unavailable`. Unknown or
  unpublished papers and problems return `404`, and an id that is not a slug returns `400`.
- **New command:** `bun run content:status <paper-id> <draft|published|archived>` changes
  a paper's status without writing a version.
- **New variable:** `RUNS_PER_DAY` (default 100), published by `/v1/config`.

### Content model (`packages/content`)

- `extractPythonInterface()` turns helper source into its public interface: top-level
  function and class signatures, docstrings and public method signatures, with every body
  replaced by `...`. It handles multi-line signatures, one-line definitions, and brackets
  or colons inside strings. Stored as `helpersInterface` in `public.json`, replacing
  `hasHelpers`.
- `ContentStore.setPaperStatus()` records the first publication. Tracks are now cached
  like the index.
- The test fixtures moved to `src/testing.ts`, exported as `@repo/content/testing`, so the
  backend's canary test uses the same canary library.

### Shared contract (`packages/shared`)

- zod schemas for every response above (`http/content.ts`, `http/config.ts`), plus
  `FEATURES` and `MAX_CODE_BYTES`.
- Two zod-free entry points for browser code: `@repo/shared/vocabulary` (difficulties,
  tags, statuses…) and `@repo/shared/site`.

### UI primitives (`packages/ui`)

- `Tabs`, `TabList`, `Tab`, `TabPanel`: the WAI-ARIA pattern (arrow keys, Home and End,
  roving tab index). The selected panel renders on the server.
- `Dialog`: built on the native `<dialog>` element, which traps focus, closes on Escape
  and returns focus to the element that opened it.
- `nextRovingIndex()` holds the keyboard logic, with tests.

### Web (`apps/web`)

| Route                                    | What                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/`                                      | What it is, how it works, a sample first step from the content, papers                                       |
| `/papers`                                | Catalogue with search (titles and authors, accent-insensitive), topic and difficulty filters kept in the URL |
| `/papers/[paperId]`                      | Header, link to the paper, ordered steps, "Start with step 1"                                                |
| `/papers/[paperId]/problems/[problemId]` | The workspace: description and tutorial tabs, rules box, helper signatures, editor, report link              |
| `/roadmap`                               | Tracks as ordered paper lists                                                                                |
| `/about`, `/terms`, `/privacy`           | Static. Privacy states exactly what is stored now: drafts and theme in the browser, minimal request logs     |
| `/sitemap.xml`, `/robots.txt`            | Every published paper and problem; per-user and admin paths disallowed                                       |
| Open Graph images                        | Generated per paper and problem from title, summary and difficulty                                           |

- **Rendering.** Content pages use ISR, revalidating every 30 s. Dynamic routes render on
  first request. Server Components fetch public endpoints without cookies and validate
  every response (`lib/api/fetch-json.ts`).
- **Markdown.** `react-markdown` with GFM, KaTeX maths and highlight.js, all on the
  server. Raw HTML is dropped, and external links open in a new tab with
  `noopener noreferrer`. The KaTeX CSS and fonts are bundled, so they load from this
  origin.
- **Editor.** Monaco is copied from `node_modules` into `public/monaco/` before
  `dev`/`build` (`scripts/copy-monaco.ts`, git-ignored) and loaded only on the workspace,
  in the browser. It uses Python mode, 4-space indents, no minimap and Geist Mono, and
  follows the site theme. Escape leaves the editor unless a widget needs it. An editable
  `<textarea>` with the same text shows until Monaco is ready, so the page works without
  JavaScript and the layout does not jump.
- **Drafts.** Saved to `localStorage` under `draft:v1:<paperId>/<problemId>` 500 ms after
  typing stops, and immediately on `pagehide`. A draft equal to the starter is deleted.
  When the starter has changed since the draft was saved, a notice offers "Keep my draft"
  or "Load the new starter". **Reset** asks for confirmation in a `Dialog`. Every storage
  access is guarded, and the status line says "Drafts are off in this browser" when
  storage is blocked.
- **Theme.** System, light or dark, saved in `localStorage`. An inline script applies it
  before the first paint.
- **Security headers.** CSP in report-only mode, HSTS, nosniff, Referrer-Policy,
  Permissions-Policy, COOP and X-Frame-Options (`lib/security/headers.ts`, tested).
- **Unit tests:** web now has its own `bun test` suite (29 tests). It covers the validated
  fetch, drafts, catalogue filters, formatting, the report link, the sample-problem choice,
  theme parsing and the security headers.

### API contract (`postman/`)

A v3 (git-native YAML) collection with 10 requests and 38 assertions. It covers every
endpoint, plus the 304, 400 and 404 cases and checks every response must pass (request
id, nosniff, error envelope). Requests discover a paper and a problem from the catalogue,
so it runs on any instance. There are `local` and `preview` environments. Run it with
`bun run api:contract`. CI syncs the content, starts the backend and runs it.

## How to run

```sh
docker compose -f docker-compose.dev.yml up -d   # Postgres (needed by content commands)
bun run content:sync                            # publish content/ to apps/backend/.storage
bun dev                                         # web :3000, backend :8797
```

Then open <http://localhost:3000>. Other commands:

```sh
bun run content:status attention-is-all-you-need draft   # hide a paper; back with "published"
bun run api:contract                                     # the Postman collection, against :8797
```

**Local storage written before M2 must be re-synced** because the stored format changed
(`hasHelpers` became `helpersInterface`): `rm -rf apps/backend/.storage && bun run content:sync`.

## Verification

From the repository root, all passing:

| Check                    | Result                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `bun run format:check`   | clean                                                                                                                         |
| `bun run lint`           | 9/9 workspaces, zero warnings                                                                                                 |
| `bun run check-types`    | 9/9                                                                                                                           |
| `bun run test`           | 216 tests pass: backend 51, content 36, web 29, runner 28, storage 26, shared 17, ui 17, pipeline 9, db 3                     |
| `bun run build`          | passes with the API up, **and with it unreachable** (`API_ORIGIN=http://127.0.0.1:1`): pages prerender an "unavailable" state |
| `bun run content:verify` | 9 verified, 0 failed                                                                                                          |
| `bun run api:contract`   | 10 requests, 38 assertions, 0 failed; `postman collection lint` clean                                                         |

Acceptance checks of spec 12 §M2:

| Check                                                    | Evidence                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A problem page shows its description without JavaScript  | Headless Chrome with JavaScript disabled: the description, rendered KaTeX, rules box and editor fallback are in the page. The catalogue lists all 3 papers the same way.        |
| A status change shows within a minute, without a rebuild | Production build. `content:status attention-is-all-you-need draft`: gone from `/papers` after **12 s**, paper page 404. Back to `published`: listed and 200 after **27 s**.     |
| Typing, reloading and returning restores the text        | Headless Chrome: typed into Monaco, draft in `localStorage` after 500 ms, reload restored it. Reset (after confirming) restored the starter and removed the draft.              |
| The canary passes against every endpoint so far          | `apps/backend/test/canary.test.ts` discovers every paper and problem path from the catalogue, plus health, config and tracks. Helper bodies carry the canary; it never appears. |
| The Postman collection passes against the preview API    | Passes against a local production backend and runs in CI. **No preview deployment exists yet.**                                                                                 |

Also checked in the browser (18 scripted checks, all passing):

- Escape leaves the editor and closes the dialog.
- Cancelling Reset keeps the draft.
- Search and filters update the URL, and impossible filters show the empty state.
- The theme choice survives a reload.
- Every request goes to the site's own origin.
- No console errors and no CSP report-only violations.
- Unknown papers and problems answer HTTP **404**.

## Deviations from the specs

All are reflected in the specs in this change.

1. **Typed client (05 §2).** Responses are validated with the shared zod schemas through
   `fetchJson`, not `hc<AppType>()`. Importing `AppType` pulls the backend's module graph
   (Bun, Drizzle, drivers) into the web type-check, and `hc` does not validate responses.
2. **Cache timings (05 §4, 08 §1, 01).** Shared caches keep responses 20 s instead of 60,
   pages revalidate every 30 s instead of 60, and the server's index cache lasts 10 s.
   With the earlier numbers, layered caches could take about two minutes. ETags are body
   digests rather than "the index's etag / the paper's version", because a status change
   alters a response without a new version.
3. **No `loading.tsx` on content pages (08 §1, §8).** A loading boundary streams the real
   content in a hidden chunk that only JavaScript reveals, which broke the
   no-JavaScript acceptance check. It also turned unknown ids into soft 404s with status 200.
   Content pages are cached, so skeletons would rarely show.
4. **CSP without nonces (11 §2).** Nonces force every page to render per request, which
   would end caching. Report-only, with `'unsafe-inline'` scripts for now; the options
   before enforcing are recorded in the spec.
5. **Narrow screens (08 §5).** Panes stack instead of turning the editor into a tab. The
   resizable divider comes with M4's results pane.
6. **Report link (08 §5.6).** Opens a prefilled GitHub issue (title, page, label
   `content`) until in-app feedback lands in M7.
7. **Landing page (08 §1).** Revalidated like content rather than fully static, so its
   sample problem and papers come from this instance's content rather than hard-coded
   links.
8. **`/v1/config` features.** Each is reported off until the milestone that builds it, so
   the web app never links to a screen that does not exist.
9. **`year` is nullable and `order` is 1-based among published problems (05 §5).**

## Things to know

- **JavaScript budget not met (08 §11).** Content pages ship 187–208 KB gzipped against
  a 150 KB target. About 150 KB is the framework runtime (React DOM, Next.js router,
  RSC client) on every page; this app adds about 35–55 KB. Zod was 87 KB of it before the
  vocabulary split and `zod/mini`; browser code must keep importing from
  `@repo/shared/vocabulary`, `@repo/shared/site` and `zod/mini`, never `@repo/shared` or
  `zod`.
- **Status 404 depends on not streaming.** Adding a `loading.tsx` or a `<Suspense>`
  above the `notFound()` check on a content route brings back soft 404s. Comments in both
  pages say so.
- **Production builds without an API** cache an "unavailable" catalogue for up to 30 s
  after deployment. Deployments with `API_ORIGIN` reachable at build (the normal case)
  prerender real content.
- `public/monaco/` is about 25 MB of vendored files, copied at `dev`/`build` and
  git-ignored.
- CI now installs the Postman CLI with its official install script.

## Not done

- **Preview deployment** for the Postman run (needs the Vercel projects from M0). CI runs
  the collection against a local backend instead.
- **Rate limit on public reads** (300/min per IP, spec 11 §3) needs the Postgres-backed
  limiter from M3.
- **Solved marks, progress bars, "Continue"** need accounts (M3) and progress (M5).
- **Resizable workspace divider** and the Results and Submissions tabs (M4).
- **Browser checks in CI.** The 18 headless-Chrome checks were run from a script outside
  the repository; adding Playwright to the repository and CI is proposed for M4, when the
  workspace gains Run and Submit.
- From M1, still pending: creating the real R2 buckets, token and CORS rule.

## Ready for M3

Accounts and roles: Better Auth on the backend, sign-up/sign-in pages, and
`/v1/config` starts reporting `signups` and `emailVerification` from configuration, which
the header reads to show sign-in.
