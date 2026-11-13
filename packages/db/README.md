# `@repo/db`

Postgres access for server-side code: Drizzle ORM over Bun's built-in `Bun.sql`.

```ts
import { createDb, schema } from "@repo/db";

// `config` comes from the app's validated env.ts; nothing else reads process.env.
const db = createDb({ url: config.databaseUrl }); // pooled; prepared statements off
```

## Scripts

| Script                | Does                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| `bun run db:generate` | Writes a SQL migration in `drizzle/` from changes to `src/schema/`. Commit it. |
| `bun run db:migrate`  | Applies pending migrations to `DATABASE_URL_DIRECT`, else `DATABASE_URL`.      |
| `bun run db:studio`   | Opens Drizzle Studio.                                                          |
| `bun test`            | Runs the migration test when `DATABASE_URL` is set; skips it otherwise.        |

Copy `.env.example` to `.env` for local use; it points at `docker-compose.dev.yml`.

## Rules

- Tables and columns are `snake_case`, plural table names (docs/specs/04-database.md §2).
- Never edit a migration after it is merged. Migrations must keep working with the
  previous release (docs/specs/04-database.md §9).
- Only server-side code imports this package; lint blocks it in the web app and UI kit.
