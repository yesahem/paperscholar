import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { closeDb, createDb, migrateDatabase } from "../src";

/**
 * Runs against a real Postgres when DATABASE_URL is set (CI provides one; locally,
 * start docker-compose.dev.yml). Skipped otherwise.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("migrations", () => {
  const db = createDb({ url: url ?? "", maxConnections: 1, prepare: true });

  afterAll(async () => {
    await closeDb(db);
  });

  test("apply cleanly and are idempotent", async () => {
    await migrateDatabase(db);
    await migrateDatabase(db);

    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_name = 'rate_limit_counters'`,
    );
    expect(rows.length).toBe(1);
  });
});
