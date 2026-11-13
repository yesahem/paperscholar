<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Project rules

These rules apply to every change in this repository, by people and by agents.
`docs/specs/` is the source of truth for what to build; this file is how to build it.

## 1. Production-grade code only

- **No placeholders in shipped code.** No `TODO` stubs, mock data in app paths, commented-out
  code, or `console.log` debugging left behind. If something is deferred, it is absent, and the
  milestone report says so.
- **TypeScript strict, no escape hatches.** No `any`, no `@ts-ignore`/`@ts-expect-error`, no
  non-null `!` to silence the compiler. Model the real type instead. `tsc` must pass with
  `noUnusedLocals` and `noUnusedParameters`.
- **Validate at every boundary with zod**: environment variables (`parseEnv` from
  `@repo/shared`), request params/query/body (`validate()` in the backend), responses read by
  the web app, files, and external API payloads. Inside a boundary, trust the types.
- **Errors are typed and never swallowed.** The backend throws `AppError` with a code from
  `@repo/shared`; one handler renders the error envelope (spec 05 §3). Messages sent to users
  never contain internals. Unexpected errors are logged with their stack.
- **Configuration is explicit.** Each app reads `process.env` in exactly one module (`env.ts`).
  Every variable is documented in that app's `.env.example`.
- **Secrets stay server-side** and out of logs. Never log bodies, code, cookies, tokens or emails.
- **Tests prove behaviour.** Every service, route and pure helper ships with `bun test` tests in
  `test/`, mirroring `src/`. A bug fix comes with a test that failed before it.
- **Read the installed docs before using a framework API.** Next.js 16.3 (`node_modules/next/dist/docs`),
  Turborepo 2.11 (`node_modules/turbo/docs`), Bun (`node_modules/bun-types/docs`) and TypeScript 7
  differ from older guidance. Pin exact dependency versions.

## 2. Paths, names and format

| Thing                      | Convention                                                | Example                                         |
| -------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Files and folders          | `kebab-case`                                              | `file-upload.tsx`, `request-logger.ts`          |
| React components           | `PascalCase` exports, one main component per file         | `export function FileUpload`                    |
| Functions, variables       | `camelCase`; constants `SCREAMING_SNAKE_CASE`             | `loadConfig`, `MAX_JSON_BODY_BYTES`             |
| Database                   | `snake_case` tables and columns; plural table names       | `rate_limit_counters.window_start`              |
| JSON and TypeScript        | `camelCase` keys                                          | `{ requestId }`                                 |
| Tests                      | `test/<same path as src>.test.ts`                         | `src/lib/format.ts` → `test/lib/format.test.ts` |
| Internal packages          | `@repo/<name>`, imported only through their `exports` map | `@repo/ui/components/button`                    |
| App-internal imports (web) | `@/` alias, never long `../../` chains                    | `@/lib/env`                                     |

Package layout:

```
apps/backend/src/   index.ts (serverless) · main.ts (Bun.serve) · create-app.ts · env.ts · types.ts
                    routes/ · services/ · middleware/ · adapters/ · lib/
apps/web/           app/ (routes) · components/<feature>/ · lib/ (env, api clients)
packages/<name>/    src/ · test/ · package.json with an explicit `exports` map
```

- Named exports only, except where a framework requires a default (Next.js pages, configs,
  the serverless entry).
- No barrel re-exports inside apps. Packages expose a deliberate public surface in `exports`.
- Formatting is Prettier's (`bun run format`); lint runs with zero warnings allowed.
- Commits follow Conventional Commits: `feat(web): …`, `fix(backend): …`, `docs(specs): …`.

## 3. Reusable components first

- **Every UI primitive comes from `@repo/ui`**: buttons, links styled as buttons
  (`buttonVariants`), text inputs, text areas, labels, form fields, file uploads, cards, badges,
  alerts, spinners, skeletons, separators. Apps never style a raw `<button>`, `<input>` or
  `<input type="file">` themselves.
- **Missing primitive? Add it to `@repo/ui` first**, with variants, accessibility and tests for
  any logic, then use it. Do not create a one-off in an app.
- **Forms** wrap each control in `Field` (label, help text, error, ARIA wiring).
- **Feature compositions** (a paper card, the results panel) live in
  `apps/web/components/<feature>/` and are built from `@repo/ui` primitives.
- **Style with design tokens** (`bg-primary`, `text-muted-foreground`, `border-input`), never raw
  colours, so light and dark themes both work. Adjust layout with `className`; `cn()` merges it.
- Components are keyboard-operable, label every control, and never use colour as the only signal.

## 4. Milestone workflow

Work follows `docs/specs/12-milestones.md`. For each milestone:

1. Build it on a branch named `feat/m<N>-<slug>`.
2. Pass, from the repository root: `bun run format:check`, `bun run lint`,
   `bun run check-types`, `bun run test`, `bun run build`, plus the milestone's acceptance checks.
3. Write `docs/milestones/M<N>-<slug>.md`: what was built, how to run it, verification evidence,
   deviations from the specs (and update the specs in the same change), and what is deferred.
   Add it to `docs/milestones/README.md`.
4. Commit with a Conventional Commit message. Push only when the maintainer asks.
