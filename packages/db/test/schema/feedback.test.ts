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

/**
 * The feedback and quiz tables refuse rows the API would never write
 * (docs/specs/10-secondary-features.md §1, §4).
 */
describe.skipIf(!url)("feedback and exam_attempts constraints", () => {
  let database: TestDatabase;
  let db: Database;
  const userId = "user-constraints";

  beforeAll(async () => {
    database = await createTestDatabase(url ?? "");
    db = createDb({ url: database.url, maxConnections: 1 });
    await db.insert(schema.user).values({
      id: userId,
      name: "constraints",
      email: "constraints@example.com",
    });
  });

  afterAll(async () => {
    await closeDb(db);
    await database.drop();
  });

  const feedbackRow = (fields: Partial<typeof schema.feedback.$inferInsert>) => ({
    id: crypto.randomUUID(),
    userId,
    type: "review" as const,
    body: "Clear and useful.",
    status: "pending" as const,
    ...fields,
  });

  test("accepts a review and a step report", async () => {
    await db.insert(schema.feedback).values(feedbackRow({ rating: 5 }));
    await db.insert(schema.feedback).values(
      feedbackRow({
        type: "bug",
        status: "open",
        paperId: "adam",
        problemId: "adam-step",
      }),
    );
  });

  test("refuses a status of the other type, a rating on a bug, half a step and an empty body", async () => {
    for (const row of [
      feedbackRow({ status: "resolved" }),
      feedbackRow({ type: "bug", status: "approved" }),
      feedbackRow({ type: "bug", status: "open", rating: 3 }),
      feedbackRow({ rating: 6 }),
      feedbackRow({ type: "bug", status: "open", paperId: "adam" }),
      feedbackRow({ paperId: "adam", problemId: "adam-step" }),
      feedbackRow({ body: "" }),
      feedbackRow({ body: "x".repeat(2001) }),
    ]) {
      expect(await refused(db.insert(schema.feedback).values(row))).toBe(true);
    }
  });

  const attemptRow = (fields: Partial<typeof schema.examAttempts.$inferInsert>) => ({
    id: crypto.randomUUID(),
    userId,
    topics: [{ id: "nlp", title: "NLP" }],
    questions: [],
    total: 5,
    expiresAt: new Date(Date.now() + 600_000),
    ...fields,
  });

  test("an attempt is graded all at once: score, answers and time together", async () => {
    await db.insert(schema.examAttempts).values(attemptRow({}));
    await db
      .insert(schema.examAttempts)
      .values(
        attemptRow({ score: 3, answers: [0, 1, null, 2, 3], submittedAt: new Date() }),
      );
    for (const row of [
      attemptRow({ score: 3 }),
      attemptRow({ submittedAt: new Date(), answers: [] }),
      attemptRow({ score: 6, answers: [], submittedAt: new Date() }),
    ]) {
      expect(await refused(db.insert(schema.examAttempts).values(row))).toBe(true);
    }
  });
});
