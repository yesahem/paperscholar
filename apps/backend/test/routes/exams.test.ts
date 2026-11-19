import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, schema } from "@repo/db";
import {
  errorBodySchema,
  examAttemptListSchema,
  examAttemptSchema,
  examTopicListSchema,
  openExamAttemptSchema,
  submittedExamAttemptSchema,
  type ExamQuestion,
} from "@repo/shared";
import { TestBrowser } from "../auth-client";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, testConfig } from "../helpers";

let content: SyncedContent;
beforeAll(async () => {
  content = await syncedContent();
});
afterAll(async () => {
  await content.cleanup();
});

/** The fixture's question `<prefix>-00n` has answer `n % 3` (`examYaml`). */
function rightAnswer(question: ExamQuestion): number {
  return Number(question.id.split("-").at(-1)) % 3;
}

describe("GET /v1/exams/topics", () => {
  test("lists every topic with its question count, publicly and cacheably", async () => {
    const { app } = createTestApp({}, content.reader);
    const response = await app.request("/api/v1/exams/topics");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(examTopicListSchema.parse(await response.json())).toEqual({
      items: [
        { id: "nlp", title: "Natural Language Processing", questionCount: 8 },
        { id: "vision", title: "Vision", questionCount: 3 },
      ],
    });
  });

  test("is empty on an instance with no quiz content", async () => {
    const { app } = createTestApp();
    expect(await (await app.request("/api/v1/exams/topics")).json()).toEqual({
      items: [],
    });
  });
});

describe("attempts without a session", () => {
  test("are 401", async () => {
    const { app } = createTestApp({}, content.reader);
    const browser = new TestBrowser(app);
    expect((await browser.request("/api/v1/exams/attempts")).status).toBe(401);
    const start = await browser.request("/api/v1/exams/attempts", {
      method: "POST",
      body: { topics: ["nlp"], count: 5 },
    });
    expect(start.status).toBe(401);
  });
});

describe.skipIf(!DATABASE_URL)("quiz attempts", () => {
  const database = useTestDatabase();

  async function learner(limits: Partial<ReturnType<typeof testConfig>["limits"]> = {}) {
    const config = testConfig();
    const { app } = createTestApp(
      { limits: { ...config.limits, ...limits } },
      content.reader,
      { db: database.db },
    );
    const browser = new TestBrowser(app);
    const username = `quiz${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    await browser.signUp({ email: `${username}@example.com`, username });
    return { app, browser };
  }

  async function start(browser: TestBrowser, topics = ["nlp", "vision"], count = 10) {
    const response = await browser.request("/api/v1/exams/attempts", {
      method: "POST",
      body: { topics, count },
    });
    expect(response.status).toBe(201);
    return openExamAttemptSchema.parse(await response.json());
  }

  test("starting draws the questions, without answers, and sets the time limit", async () => {
    const { browser } = await learner();
    const attempt = await start(browser, ["nlp", "vision"], 10);
    expect(attempt.status).toBe("in_progress");
    expect(attempt.total).toBe(10);
    expect(attempt.questions).toHaveLength(10);
    expect(attempt.topics).toEqual([
      { id: "nlp", title: "Natural Language Processing" },
      { id: "vision", title: "Vision" },
    ]);
    const ids = attempt.questions.map((question) => `${question.topicId}/${question.id}`);
    expect(new Set(ids).size).toBe(10);
    // 10 questions × 90 s = 15 minutes.
    expect(Date.parse(attempt.expiresAt) - Date.parse(attempt.startedAt)).toBe(900_000);
  });

  test("asking for more questions than exist serves every question, with at least ten minutes", async () => {
    const { browser } = await learner();
    const attempt = await start(browser, ["vision"], 30);
    expect(attempt.total).toBe(3);
    expect(Date.parse(attempt.expiresAt) - Date.parse(attempt.startedAt)).toBe(600_000);
  });

  test("an unknown topic or a bad count is a validation error", async () => {
    const { browser } = await learner();
    const unknown = await browser.request("/api/v1/exams/attempts", {
      method: "POST",
      body: { topics: ["nlp", "astrology"], count: 5 },
    });
    expect(unknown.status).toBe(400);
    expect(errorBodySchema.parse(await unknown.json()).error.details).toEqual({
      issues: [{ path: "topics.1", message: "is not a quiz topic on this site" }],
    });
    const tooFew = await browser.request("/api/v1/exams/attempts", {
      method: "POST",
      body: { topics: ["nlp"], count: 4 },
    });
    expect(tooFew.status).toBe(400);
  });

  test("submitting grades once and only then reveals answers and explanations", async () => {
    const { browser } = await learner();
    const attempt = await start(browser);
    const answers = attempt.questions.map((question, index) =>
      index === 0
        ? null
        : index === 1
          ? (rightAnswer(question) + 1) % 4
          : rightAnswer(question),
    );
    const response = await browser.request(
      `/api/v1/exams/attempts/${attempt.id}/submit`,
      {
        method: "POST",
        body: { answers },
      },
    );
    expect(response.status).toBe(200);
    const graded = submittedExamAttemptSchema.parse(await response.json());
    expect(graded.score).toBe(8);
    expect(graded.total).toBe(10);
    expect(graded.questions[0]).toMatchObject({ chosen: null, correct: false });
    expect(graded.questions[1]?.correct).toBe(false);
    expect(graded.questions[2]).toMatchObject({ correct: true });
    expect(graded.questions[2]?.explanation).toStartWith("Option ");

    const again = await browser.request(`/api/v1/exams/attempts/${attempt.id}/submit`, {
      method: "POST",
      body: { answers },
    });
    expect(again.status).toBe(409);
    expect(errorBodySchema.parse(await again.json()).error.code).toBe("conflict");

    const reread = examAttemptSchema.parse(
      await (await browser.request(`/api/v1/exams/attempts/${attempt.id}`)).json(),
    );
    expect(reread).toEqual(graded);
  });

  test("two simultaneous submits grade once", async () => {
    const { browser } = await learner();
    const attempt = await start(browser);
    const answers = attempt.questions.map(rightAnswer);
    const statuses = await Promise.all(
      [0, 1].map(
        async () =>
          (
            await browser.request(`/api/v1/exams/attempts/${attempt.id}/submit`, {
              method: "POST",
              body: { answers },
            })
          ).status,
      ),
    );
    expect(statuses.sort()).toEqual([200, 409]);
  });

  test("answers must match the questions", async () => {
    const { browser } = await learner();
    const attempt = await start(browser);
    const short = await browser.request(`/api/v1/exams/attempts/${attempt.id}/submit`, {
      method: "POST",
      body: { answers: [0, 1] },
    });
    expect(short.status).toBe(400);
    const outOfRange = await browser.request(
      `/api/v1/exams/attempts/${attempt.id}/submit`,
      {
        method: "POST",
        body: { answers: attempt.questions.map(() => 5) },
      },
    );
    expect(outOfRange.status).toBe(400);
    // A refused submit does not use up the attempt.
    const fine = await browser.request(`/api/v1/exams/attempts/${attempt.id}/submit`, {
      method: "POST",
      body: { answers: attempt.questions.map(() => null) },
    });
    expect(fine.status).toBe(200);
  });

  test("after the time limit, a submit is 409 and the attempt shows no answers", async () => {
    const { browser } = await learner();
    const attempt = await start(browser);
    await database.db
      .update(schema.examAttempts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.examAttempts.id, attempt.id));
    const late = await browser.request(`/api/v1/exams/attempts/${attempt.id}/submit`, {
      method: "POST",
      body: { answers: attempt.questions.map(rightAnswer) },
    });
    expect(late.status).toBe(409);
    const body = await (
      await browser.request(`/api/v1/exams/attempts/${attempt.id}`)
    ).text();
    expect(examAttemptSchema.parse(JSON.parse(body)).status).toBe("expired");
    expect(body).not.toContain('"answer"');
    expect(body).not.toContain('"explanation"');
  });

  test("another user's attempt is not found", async () => {
    const { browser } = await learner();
    const attempt = await start(browser);
    const { browser: other } = await learner();
    expect((await other.request(`/api/v1/exams/attempts/${attempt.id}`)).status).toBe(
      404,
    );
    const submit = await other.request(`/api/v1/exams/attempts/${attempt.id}/submit`, {
      method: "POST",
      body: { answers: attempt.questions.map(rightAnswer) },
    });
    expect(submit.status).toBe(404);
  });

  test("the history lists the caller's attempts, newest first, a page at a time", async () => {
    const { browser } = await learner();
    const first = await start(browser, ["vision"], 5);
    const second = await start(browser, ["nlp"], 5);
    await browser.request(`/api/v1/exams/attempts/${first.id}/submit`, {
      method: "POST",
      body: { answers: first.questions.map(rightAnswer) },
    });

    const page1 = examAttemptListSchema.parse(
      await (await browser.request("/api/v1/exams/attempts?limit=1")).json(),
    );
    expect(page1.items.map((item) => item.id)).toEqual([second.id]);
    expect(page1.items[0]).toMatchObject({
      status: "in_progress",
      score: null,
      total: 5,
    });
    expect(page1.nextCursor).not.toBeNull();

    const page2 = examAttemptListSchema.parse(
      await (
        await browser.request(
          `/api/v1/exams/attempts?limit=1&cursor=${encodeURIComponent(page1.nextCursor ?? "")}`,
        )
      ).json(),
    );
    expect(page2.items[0]).toMatchObject({
      id: first.id,
      status: "submitted",
      score: 3,
      total: 3,
      topics: [{ id: "vision", title: "Vision" }],
    });
    expect(page2.nextCursor).toBeNull();
  });

  test("attempts per day are limited; a refused request does not count", async () => {
    const { browser } = await learner({ examAttemptsPerDay: 2 });
    await browser.request("/api/v1/exams/attempts", {
      method: "POST",
      body: { topics: ["astrology"], count: 5 },
    });
    await start(browser, ["nlp"], 5);
    await start(browser, ["nlp"], 5);
    const third = await browser.request("/api/v1/exams/attempts", {
      method: "POST",
      body: { topics: ["nlp"], count: 5 },
    });
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).not.toBeNull();
    const error = errorBodySchema.parse(await third.json()).error;
    expect(error.code).toBe("quota_exceeded");
    expect(error.details).toEqual({
      resetsAt: expect.stringMatching(/T00:00:00\.000Z$/),
    });
  });
});
