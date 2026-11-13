import { closeDb, createDb, type Database } from "@repo/db";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { afterAll, beforeAll } from "bun:test";

/** Postgres for integration tests. CI provides one; locally, docker-compose.dev.yml. */
export const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Gives the calling test file its own migrated database, dropped afterwards
 * (docs/specs/11-security-ops.md §6). Use inside `describe.skipIf(!DATABASE_URL)`.
 */
export function useTestDatabase(): { readonly db: Database; readonly url: string } {
  let database: TestDatabase | null = null;
  let db: Database | null = null;

  beforeAll(async () => {
    database = await createTestDatabase(DATABASE_URL ?? "");
    db = createDb({ url: database.url, maxConnections: 4 });
  });

  afterAll(async () => {
    if (db) await closeDb(db);
    await database?.drop();
  });

  return {
    get db() {
      if (!db) throw new Error("The test database is not ready; use it inside a test.");
      return db;
    },
    get url() {
      if (!database)
        throw new Error("The test database is not ready; use it inside a test.");
      return database.url;
    },
  };
}
