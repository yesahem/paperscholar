/**
 * CLI: `bun run db:migrate`. Applies pending migrations to the database named
 * by DATABASE_URL_DIRECT, or DATABASE_URL when no direct URL is set.
 */
import { closeDb, createDb } from "./client";
import { migrateDatabase } from "./migrations";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

if (!url) {
  console.error(
    "db:migrate: set DATABASE_URL_DIRECT or DATABASE_URL to the database to migrate.",
  );
  process.exit(1);
}

const db = createDb({ url, maxConnections: 1, prepare: true });

try {
  await migrateDatabase(db);
  console.log("db:migrate: database is up to date.");
} catch (error) {
  console.error("db:migrate: migration failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
