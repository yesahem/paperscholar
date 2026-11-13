import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { closeDb, createDb, schema, type Database } from "../src";
import { createTestDatabase, type TestDatabase } from "../src/testing";

const url = process.env.DATABASE_URL;

/**
 * Bun.sql reads `timestamp without time zone` as local time, so on a host
 * outside UTC such columns come back shifted. Every timestamp column must be
 * `timestamptz` (docs/specs/04-database.md §2).
 */
describe.skipIf(!url)("timestamps", () => {
  let database: TestDatabase;
  let db: Database;
  const originalTz = process.env.TZ;

  beforeAll(async () => {
    process.env.TZ = "Asia/Kolkata";
    database = await createTestDatabase(url ?? "");
    db = createDb({ url: database.url, maxConnections: 1 });
  });

  afterAll(async () => {
    process.env.TZ = originalTz;
    await closeDb(db);
    await database.drop();
  });

  test("read back the instant that was written, whatever the host's time zone", async () => {
    const expiresAt = new Date("2026-06-01T12:00:00.000Z");
    const id = crypto.randomUUID();
    await db.insert(schema.verification).values({
      id,
      identifier: "test",
      value: "test",
      expiresAt,
      updatedAt: expiresAt,
    });
    const [row] = await db
      .select()
      .from(schema.verification)
      .where(eq(schema.verification.id, id));
    expect(row?.expiresAt.toISOString()).toBe(expiresAt.toISOString());
  });
});
