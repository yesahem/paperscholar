# 08 — Web

`apps/web`: Next.js App Router, React 19, Tailwind CSS 4.

Next.js 16.3 is newer than most tutorials. Before using a framework feature (caching
directives, the request-interception file, metadata APIs), read the docs for the installed
version.

## 1. Rendering strategy

| Kind of page                                    | How it renders                                           | Data source                         |
| ----------------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| Landing, about, legal                           | Static                                                   | None                                |
| Catalogue, paper page, problem page, roadmap    | On the server, cached, revalidated every 30 seconds      | Public content endpoints of the API |
| Leaderboard, public profile                     | Shell rendered on the server; data loaded in the browser | API                                 |
| Settings, maintainer screens, anything per-user | Loaded in the browser                                    | API                                 |

Rules:

- Content is in object storage, served by the API, and can change at any time (a
  maintainer publishes a paper),
  so content pages are not generated at build time. They are rendered on first request,
  cached, and refreshed in the background. A newly published paper appears within a
  minute. The build does not depend on the API being reachable.
- Server Components fetch **public** endpoints only, without cookies. They never read the
  session. All per-user data is fetched in the browser with TanStack Query. This keeps
  every content page cacheable for everyone.
- Unknown paper or problem IDs render the 404 page **with HTTP status 404**. Content pages
  therefore have no `loading.tsx`: a loading boundary starts streaming before the page
  runs, which turns a 404 into a 200 and hides the content from browsers without
  JavaScript. They are cached, so a skeleton would rarely show anyway.
- When the API cannot be reached during `next build`, pages prerendered at build time
  (landing, catalogue, roadmap, sitemap) render a "not available yet" state and replace it
  at the first revalidation (`loadAtBuild` in `apps/web/lib/api/content.ts`). At run time a
  failed refresh keeps serving the last good page.
- The browser calls the API at same-origin `/api/...` only.
- `GET /v1/config` is fetched once and decides which navigation items and screens exist
  on this instance (spec 13 §4). It is served from M2; the web app starts reading it with
  the first switchable item, sign-up, in M3.

### The proxy

```js
// apps/web/next.config.js
async rewrites() {
  return [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN}/api/:path*` }];
}
```

## 2. Routes

| Route                                                   | Purpose                                                              | Milestone         |
| ------------------------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| `/`                                                     | Landing: what it is, a sample problem, call to action                | 2                 |
| `/papers`                                               | Catalogue with tag and difficulty filters, search by title           | 2                 |
| `/papers/[paperId]`                                     | Paper header, link to the paper, ordered step list with solved marks | 2                 |
| `/papers/[paperId]/problems/[problemId]`                | The workspace                                                        | 2 (read), 4 (run) |
| `/roadmap`                                              | Tracks with per-paper progress                                       | 2                 |
| `/login`, `/signup`, `/reset-password`, `/verify-email` | Auth pages                                                           | 3                 |
| `/leaderboard`                                          | Rankings, sort tabs, user search                                     | 5                 |
| `/profile`                                              | Redirects to own profile, or to `/login`                             | 5                 |
| `/profile/[username]`                                   | Public profile                                                       | 5                 |
| `/settings`                                             | Account, avatar, password, delete account                            | 5                 |
| `/admin/papers`                                         | Papers, drafts and ingestions                                        | 6                 |
| `/admin/papers/new`                                     | Upload a paper                                                       | 6                 |
| `/admin/ingestions/[id]` and `/plan`, `/review`         | Pipeline progress, plan editor, review screen (spec 09 §17)          | 6                 |
| `/admin/users`                                          | Roles (admin only)                                                   | 6                 |
| `/test`                                                 | Quiz mode                                                            | 7                 |
| `/jobs`, `/professors`                                  | Listings, when the instance has data                                 | 7                 |
| `/courses`, `/courses/[courseId]`                       | Courses                                                              | 8                 |
| `/cold-mail`                                            | Cold-mail generator                                                  | 9                 |
| `/interview`                                            | Mock interview                                                       | 10                |
| `/about`, `/terms`, `/privacy`                          | Static                                                               | 2                 |

There is no pricing page. `/admin/*` renders its screens only for maintainers and admins;
everyone else gets the 404 page, and the API enforces the same rule.

## 3. Structure

```
apps/web/
  app/
    (marketing)/           landing, about, legal
    (app)/                 everything with the app header
      papers/...
      leaderboard/, profile/, settings/, roadmap/
      admin/               maintainer screens: papers, ingestions, review, users
    (auth)/                login, signup, reset-password, verify-email
    layout.tsx, not-found.tsx, error.tsx
  components/              app-specific components
    workspace/             editor, result panel, tabs
  lib/
    api/                   fetch-json.ts (validated fetch), content.ts (server-only
                           content reads), health.ts
    auth/                  Better Auth calls (auth-api.ts), messages, safe redirects
    queries.ts             TanStack Query hooks, one per endpoint
    env.ts
  public/monaco/           self-hosted editor assets (copied at build)
```

Generic, reusable components go in `packages/ui`. Anything that knows about papers,
submissions or users stays in `apps/web/components`.

## 4. Design system

- Tailwind CSS 4 with CSS-variable tokens for colour, radius and spacing. Dark theme by
  default, light theme supported, following the system preference until the user chooses.
- `packages/ui` provides: Button, Input, Label, Dialog, Tabs, Badge, Tooltip, DropdownMenu,
  Toast, Skeleton, Progress, Avatar, Separator, ResizablePanels.
- Fonts: the Geist Sans and Geist Mono files already in the starter.
- Icons: one icon set, imported per icon.
- The starter's CSS modules and demo page are removed.

## 5. The workspace

The most important screen. Desktop layout:

```
┌────────────────────────────────────────────────────────────────────────┐
│ ← Paper title / Problem title   [easy]        [Reset] [Run] [Submit]   │
├──────────────────────────────────┬─────────────────────────────────────┤
│ Description │ Tutorial │ Results │                                     │
│ │ Submissions                    │           Monaco editor             │
│                                  │           (Python)                  │
│  rendered markdown + maths       │                                     │
│                                  │                                     │
│  ── limits ──                    │                                     │
│  Allowed: numpy                  │                                     │
│  Not allowed: torch, jax         │                                     │
│  Time 2 s/test · Memory 256 MB   │                                     │
└──────────────────────────────────┴─────────────────────────────────────┘
```

Below 900 px wide, the panes stack: instructions first, the editor below them.

> **M2 status.** The panes are a fixed 50/50 split; the resizable divider (and
> `ResizablePanels` in `packages/ui`) arrives with the Results tab in M4.
>
> **M4 status.** `ResizablePanels` is the window-splitter pattern (arrow keys, Home and
> End, pointer drag, 25–75 %), and stacks below 900 px. Stacking replaces
> "the editor becomes a tab", which hid the description while typing on small screens.

### 5.1 Left pane

| Tab         | Content                                                                            |
| ----------- | ---------------------------------------------------------------------------------- |
| Description | `description.md` rendered; then a limits box built from the problem's fields       |
| Tutorial    | `tutorial.md`; tab hidden when there is none                                       |
| Results     | Latest run result (5.5)                                                            |
| Submissions | The user's history for this problem; each row can restore its code into the editor |

The Description and Tutorial are rendered to HTML on the server. When a problem has
helpers, the limits box lists them with their signatures.

### 5.2 Editor

- Monaco through `@monaco-editor/react`, loaded with a dynamic import and no server
  rendering. A plain `<textarea>` with the starter code shows until it loads, so the page
  is usable and the layout does not jump.
- **Self-hosted assets.** The editor's files are served from `/monaco/`, not a public CDN,
  so the Content-Security-Policy needs no third-party script source.
- Python language mode, 4-space indentation, minimap off, Geist Mono, theme matched to the
  site theme.
- Shortcuts: `Ctrl/Cmd + Enter` runs; `Ctrl/Cmd + Shift + Enter` submits.

### 5.3 Drafts

- The editor's content is saved to `localStorage` under
  `draft:v1:<paperId>/<problemId>` as `{ code, starterHash, updatedAt }`, debounced by
  500 ms.
- On load: if a draft exists it is used; otherwise the starter.
- If the stored `starterHash` differs from the current starter, a notice offers "keep my
  draft" or "load the new starter".
- **Reset** restores the starter after confirmation.
- `localStorage` access is wrapped in `try/catch`; the page works without it.
- Drafts are not sent to the server. Submitted code is recoverable from the Submissions tab.

### 5.4 Run and Submit

State machine:

```
idle ──click──▶ creating ──202──▶ polling ──completed/error──▶ showing result ──▶ idle
                   │                  │
                   └─ error response  └─ 120 s without a final state ──▶ timed out
```

- **Run** sends `mode: "run"` (public tests). **Submit** sends `mode: "submit"` (public
  and hidden tests; counts toward progress).
- Both buttons are disabled from click until a final state.
- The Results tab is selected automatically on click and shows "Queued…" then "Running
  tests…".
- Polling follows spec 07 §3.

> **Built in M4.** Signed-out visitors get the sign-in modal without a request. The first
> poll is one second after the `202`, so a fast run shows its verdict after about a
> second (measured p95 1.05 s on the bundled runner). A poll that fails on the network
> is retried; any `4xx` ends the run with its message. `429`s use the new `Toast` in
> `packages/ui`. The Submissions tab pages through `GET /v1/submissions` and restores
> code with `GET /v1/submissions/:id`; it is hidden behind a notice for an unconfirmed
> email, which cannot read history. The solved mark after a passed submit arrives with
> progress in M5.

Handling of error responses:

| Response                              | UI                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `401 unauthenticated`                 | Open the sign-in modal. The draft is untouched. After sign-in the user clicks again. |
| `403 email_not_verified`              | Banner with "resend verification email"                                              |
| `409 submission_in_progress`          | Start polling the ID from `details.submissionId`                                     |
| `429 rate_limited` / `quota_exceeded` | Toast with when to retry                                                             |
| Network failure or `5xx`              | Inline error with a retry button                                                     |

### 5.5 Results

| Verdict                 | Shown                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `passed`                | Green banner, "N/N tests passed", duration. On **Submit**: "Solved" and a link to the next problem. |
| `failed`                | Red banner, "P/N tests passed", a bar, then the test list                                           |
| `time_limit_exceeded`   | Which test or "the whole run", and the limit                                                        |
| `memory_limit_exceeded` | The limit                                                                                           |
| `import_violation`      | The offending modules and the problem's allowed list                                                |
| `runtime_error`         | The error text in a monospace block                                                                 |
| `internal_error`        | "Something went wrong on our side. This run was not counted." and a retry button                    |

Test list: one row per test with a status icon, the test name turned into a sentence
(`test_output_has_shape` → "output has shape"), and duration. Failed rows expand to show
`message`, and for public tests `traceback` and `stdout`. Hidden tests carry a "hidden"
badge and show only name and message.

After a `passed` submit, the `progress` query is invalidated so solved marks update
everywhere.

### 5.6 Signed-out state and reporting

- Signed-out users can read every problem and type in the editor. Run/Submit prompts
  sign-in.
- Every step has a "Report a problem with this step" link. It files a bug report
  (spec 10 §4) tagged with the paper and problem, so a wrong test or unclear description
  written by the pipeline reaches a maintainer.

## 6. Other screens

**Catalogue.** Card grid: title, authors and year, summary, tags, problem count,
difficulty mix, and for signed-in users a progress bar.
Filters are client-side and reflected in the URL query string.

**Paper page.** Header with a link to the paper; ordered problem list with difficulty,
summary and a solved tick. Primary button: "Start" or "Continue" at the first unsolved
problem.

**Leaderboard.** Three sort tabs matching the API. Rank, avatar, username, counts. The
signed-in user's own rank is pinned at the top. Paginated 50 per page.

**Profile.** Avatar, username, bio, join date; stat tiles; a 52-week activity heatmap;
per-paper progress; follow button and counts. Own profile links to settings.

**Settings.** Username, bio, avatar upload with preview, change password, delete account
behind a typed confirmation.

> **Built in M5.** Solved marks are client components (`components/progress/`) inside the
> cached pages, filled from `GET /v1/progress`, which a passed submit invalidates along with
> profiles and rankings. The paper page's button reads "Start with step 1", "Continue with
> step N" or "Review from step 1". The leaderboard keeps `?sort=&page=` in the URL; the
> signed-in user's rank is pinned with "Show my place". `/profile/[username]` renders its
> shell on the server and loads the profile in the browser, so an unknown username shows a
> not-found state with HTTP 200. Settings change the password through Better Auth's
> `change-password`, signing out other sessions. `@repo/ui` gains `Avatar`; the bar is
> the M4 `Meter`.

**Maintainer screens.** Listed in spec 09 §17. The review screen reuses the workspace's
editor and results components: a maintainer editing a generated test and pressing
"Re-verify" sees the same per-test result view a learner sees. Maintainers get an
"Upload paper" entry in the header menu when the pipeline feature is on.

## 7. Markdown

- `react-markdown` with `remark-gfm`, `remark-math` and `rehype-katex`.
- Raw HTML is not rendered. Do not add `rehype-raw`.
- Code blocks are syntax-highlighted on the server where the page is server-rendered.
- Links to other sites open in a new tab with `rel="noopener noreferrer"`.
- The KaTeX stylesheet and fonts are served from our own origin.

## 8. States every data-driven view must have

| State      | Requirement                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Loading    | Skeleton matching the final layout. No bare "Loading…" text. Server-rendered content pages are exempt (§1). |
| Empty      | A sentence saying what will appear and how to make it appear                                                |
| Error      | What failed and a retry action. Never a blank area.                                                         |
| Signed out | What signing in would show, with the sign-in action                                                         |

## 9. Search engines and sharing

- Each static content page sets its own title, description and canonical URL.
- `sitemap.xml` is generated from the published papers and `robots.txt` is static. `/admin` and per-user pages
  (`/settings`, `/cold-mail`, …) are disallowed.
- Paper and problem pages have Open Graph images generated from title and difficulty.

## 10. Accessibility

- Every action is reachable by keyboard; focus is visible; dialogs trap and restore focus.
- Colour is never the only signal. Verdicts and test statuses have an icon and text.
- Text contrast meets WCAG AA in both themes.
- The resizable divider is operable with arrow keys.
- Pressing `Escape` inside the editor releases focus so keyboard users can leave it.

## 11. Performance targets

| Metric                                                                   | Target           |
| ------------------------------------------------------------------------ | ---------------- |
| Largest Contentful Paint on a problem page, mid-range laptop, cold cache | < 2.0 s          |
| JavaScript for content pages before the editor loads                     | < 150 KB gzipped |

> **M2 measurement.** 187–208 KB gzipped per content page. About 150 KB of that is the
> framework runtime (React DOM, the Next.js router and RSC client) present on every
> page; this app adds about 35–55 KB. The target is not met. Keeping the app's share small
> is enforced by importing zod-free modules in browser code; reaching the target needs a
> framework-level change and is tracked for review in a later milestone.
> | Editor ready after page load | < 2.5 s |
> | Cumulative Layout Shift | < 0.05 |

The editor bundle is loaded only on the workspace route.

## 12. Acceptance checks

- With JavaScript disabled, a problem page still shows its full description.
- A paper published a minute ago is listed in the catalogue without a redeploy.
- With the pipeline feature off, no maintainer upload entry appears anywhere.
- No request from the browser goes to any origin other than the site's own, the OAuth
  provider during sign-in, and object storage for signed uploads/downloads.
- No learner-facing page or response contains the private-content canary (spec 03 §9).
- Reloading the workspace mid-edit restores the draft.
- A user can complete sign-up → run → submit → see the solved mark using only the keyboard.
