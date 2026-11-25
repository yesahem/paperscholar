import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDb, createDb, schema, type Database } from "../../src";
import { createTestDatabase, type TestDatabase } from "../../src/testing";

const url = process.env.DATABASE_URL;

/** Whether the database refused the statement. */
async function refused(statement: PromiseLike<unknown>): Promise<boolean> {
  try {
    await statement;
    return false;
  } catch {
    return true;
  }
}

/** Course progress and notes refuse rows the API would never write. */
describe.skipIf(!url)("course_progress and course_notes constraints", () => {
  let database: TestDatabase;
  let db: Database;
  const userId = "user-courses";

  beforeAll(async () => {
    database = await createTestDatabase(url ?? "");
    db = createDb({ url: database.url, maxConnections: 1 });
    await db
      .insert(schema.user)
      .values({ id: userId, name: "courses", email: "courses@example.com" });
  });

  afterAll(async () => {
    await closeDb(db);
    await database.drop();
  });

  test("completion and its time go together; watched seconds are not negative", async () => {
    const row = { userId, courseId: "c", itemId: "i" };
    await db.insert(schema.courseProgress).values({ ...row, lastWatchedSeconds: 30 });
    for (const values of [
      { ...row, itemId: "a", completed: true },
      { ...row, itemId: "b", completedAt: new Date() },
      { ...row, itemId: "c", lastWatchedSeconds: -1 },
    ]) {
      expect(await refused(db.insert(schema.courseProgress).values(values))).toBe(true);
    }
  });

  test("notes are at most 10 000 characters", async () => {
    const row = { userId, courseId: "c", itemId: "i" };
    await db.insert(schema.courseNotes).values({ ...row, body: "x".repeat(10_000) });
    expect(
      await refused(
        db
          .insert(schema.courseNotes)
          .values({ ...row, itemId: "j", body: "x".repeat(10_001) }),
      ),
    ).toBe(true);
  });
});
