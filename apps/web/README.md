# web

The Next.js frontend. It renders pages and forwards `/api/*` to the backend, so the
browser only ever talks to this origin (docs/specs/01-architecture.md §4.2).

## Run

```sh
cp .env.example .env     # once
bun dev                  # from the repository root: web on :3000, backend on :8797
```

## Layout

| Path                    | Holds                                                           |
| ----------------------- | --------------------------------------------------------------- |
| `app/(site)/`           | Document pages: landing, papers, paper, roadmap, about, legal   |
| `app/(workspace)/`      | The problem workspace (full-height, no footer)                  |
| `components/<feature>/` | `content/`, `workspace/`, `layout/`, `theme/`, `legal/`, `og/`  |
| `lib/`                  | `env.ts`, `api/` (validated fetches), `content/` (pure helpers) |
| `scripts/`              | `copy-monaco.ts`: self-hosts the editor in `public/monaco/`     |
| `test/`                 | `bun test` for everything in `lib/`                             |

## Rules

- UI primitives come from `@repo/ui`. Do not hand-roll buttons, inputs or file pickers.
- Import app code through the `@/` alias (`@/lib/env`), packages through `@repo/*`.
- No secrets here. `API_ORIGIN` is server-only; anything `NEXT_PUBLIC_*` is public.
- Server-only packages (`@repo/db`, `@repo/storage`, …) are blocked by lint.
- Browser code (`"use client"` and what it imports) uses `@repo/shared/vocabulary`,
  `@repo/shared/site` and `zod/mini`, never `@repo/shared` or `zod`: they would add about
  90 KB of schemas to every page.
- Content pages have no `loading.tsx`: it would break reading without JavaScript and turn
  404s into 200s (docs/specs/08-web.md §1).
