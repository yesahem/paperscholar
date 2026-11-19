import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema, type StoredExamQuestion } from "@repo/db";
import { createLogger } from "@repo/shared/logger";
import { createExams, drawQuestions, grade } from "../../src/services/exams";
import { createRateLimiter } from "../../src/services/rate-limiter";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";

describe("drawQuestions", () => {
  const pool = ["a", "b", "c", "d", "e"];

  test("takes `count` distinct items, or all of them when there are fewer", () => {
    const drawn = drawQuestions(pool, 3, Math.random);
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
    expect(drawQuestions(pool, 10, Math.random).sort()).toEqual(pool);
  });

  test("follows the random source: always 0 keeps the order, just under 1 takes from the end", () => {
    expect(drawQuestions(pool, 3, () => 0)).toEqual(["a", "b", "c"]);
    expect(drawQuestions(pool, 2, () => 0.999)).toEqual(["e", "a"]);
  });

  test("does not change the pool", () => {
    const copy = [...pool];
    drawQuestions(copy, 5, Math.random);
    expect(copy).toEqual(pool);
  });
});

describe("grade", () => {
  const question = (answer: number): StoredExamQuestion => ({
    topicId: "nlp",
    id: `q-${answer}`,
    difficulty: "easy",
    prompt: "?",
    options: ["A", "B", "C"],
    answer,
    explanation: "Because.",
  });

  test("counts matching answers; unanswered and missing answers are wrong", () => {
    expect(grade([question(0), question(1), question(2)], [0, null, 2])).toEqual({
      score: 2,
      correct: [true, false, true],
    });
    expect(grade([question(0), question(1)], [0])).toEqual({
      score: 1,
      correct: [true, false],
    });
  });
});

describe.skipIf(!DATABASE_URL)("createExams with a fixed clock", () => {
  const database = useTestDatabase();
  let content: SyncedContent;
  beforeAll(async () => {
    content = await syncedContent();
  });
  afterAll(async () => {
    await content.cleanup();
  });

  test("an attempt is open until the instant it expires, and closed from then on", async () => {
    let clock = new Date("2026-11-20T10:00:00.000Z");
    const exams = createExams({
      db: database.db,
      content: content.reader,
      limiter: createRateLimiter(database.db),
      attemptsPerDay: 10,
      logger: createLogger({ level: "error", write: () => undefined }),
      now: () => clock,
    });
    const userId = `user-${crypto.randomUUID()}`;
    await database.db
      .insert(schema.user)
      .values({ id: userId, name: "clock", email: `${userId}@example.com` });

    const attempt = await exams.start(userId, { topics: ["vision"], count: 5 });
    expect(attempt.expiresAt).toBe("2026-11-20T10:10:00.000Z");

    clock = new Date("2026-11-20T10:09:59.999Z");
    expect((await exams.get(userId, attempt.id)).status).toBe("in_progress");

    clock = new Date("2026-11-20T10:10:00.000Z");
    expect((await exams.get(userId, attempt.id)).status).toBe("expired");
    await expect(
      exams.submit(userId, attempt.id, { answers: [0, 0, 0] }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
