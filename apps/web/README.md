# web

The Next.js frontend. It renders pages and forwards `/api/*` to the backend, so the
browser only ever talks to this origin (docs/specs/01-architecture.md §4.2).

## Run

```sh
cp .env.example .env     # once
bun dev                  # from the repository root: web on :3000, backend on :8797
```

## Layout

| Path                    | Holds                                                    |
| ----------------------- | -------------------------------------------------------- |
| `app/`                  | Routes, layouts, `error.tsx`, `not-found.tsx`            |
| `components/<feature>/` | Components specific to this app, grouped by feature      |
| `lib/`                  | Environment validation (`env.ts`) and API calls (`api/`) |

## Rules

- UI primitives come from `@repo/ui`. Do not hand-roll buttons, inputs or file pickers.
- Import app code through the `@/` alias (`@/lib/env`), packages through `@repo/*`.
- No secrets here. `API_ORIGIN` is server-only; anything `NEXT_PUBLIC_*` is public.
- Server-only packages (`@repo/db`, `@repo/storage`, …) are blocked by lint.
