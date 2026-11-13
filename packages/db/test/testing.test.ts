import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { closeDb, createDb } from "../src";
import { createTestDatabase } from "../src/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("createTestDatabase", () => {
  test("creates a migrated database and drops it", async () => {
    const database = await createTestDatabase(url ?? "");
    const db = createDb({ url: database.url, maxConnections: 1 });
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_name in ('user', 'profiles')`,
    );
    expect(rows.map((row) => row.table_name).sort()).toEqual(["profiles", "user"]);
    await closeDb(db);

    await database.drop();
    const name = new URL(database.url).pathname.slice(1);
    const admin = createDb({ url: url ?? "", maxConnections: 1 });
    const left = await admin.execute(
      sql`select 1 from pg_database where datname = ${name}`,
    );
    expect(left.length).toBe(0);
    await closeDb(admin);
  });
});
