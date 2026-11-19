import { describe, expect, test } from "bun:test";
import {
  createExamAttemptSchema,
  examAttemptSchema,
  listExamAttemptsQuerySchema,
  submitExamAttemptSchema,
} from "../../src";

describe("createExamAttemptSchema", () => {
  test("accepts topics and a count between 5 and 30", () => {
    expect(createExamAttemptSchema.parse({ topics: ["nlp"], count: 5 })).toEqual({
      topics: ["nlp"],
      count: 5,
    });
    expect(
      createExamAttemptSchema.safeParse({ topics: ["nlp"], count: 30 }).success,
    ).toBe(true);
  });

  test("rejects counts out of range, no topics, repeated topics and unknown fields", () => {
    for (const body of [
      { topics: ["nlp"], count: 4 },
      { topics: ["nlp"], count: 31 },
      { topics: ["nlp"], count: 5.5 },
      { topics: [], count: 10 },
      { topics: ["nlp", "nlp"], count: 10 },
      { topics: ["Not A Slug"], count: 10 },
      { topics: ["nlp"], count: 10, seed: 1 },
    ]) {
      expect(createExamAttemptSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("submitExamAttemptSchema", () => {
  test("takes an option index or null per question", () => {
    expect(submitExamAttemptSchema.parse({ answers: [0, null, 3] })).toEqual({
      answers: [0, null, 3],
    });
  });

  test("rejects negative, fractional and impossible indexes", () => {
    for (const answers of [[-1], [1.5], [6], ["1"]]) {
      expect(submitExamAttemptSchema.safeParse({ answers }).success).toBe(false);
    }
  });
});

describe("listExamAttemptsQuerySchema", () => {
  test("defaults the page size and reads it from the query string", () => {
    expect(listExamAttemptsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listExamAttemptsQuerySchema.parse({ limit: "5" })).toEqual({ limit: 5 });
    expect(listExamAttemptsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("examAttemptSchema", () => {
  const base = {
    id: "0190f0c1-1d2e-7a3b-8c4d-5e6f7a8b9c0d",
    topics: [{ id: "nlp", title: "NLP" }],
    total: 1,
    startedAt: "2026-11-20T10:00:00.000Z",
    expiresAt: "2026-11-20T10:10:00.000Z",
  };
  const question = {
    topicId: "nlp",
    id: "nlp-001",
    difficulty: "easy" as const,
    prompt: "Which?",
    options: ["A", "B"],
  };

  test("an open attempt's questions carry no answers, even when the server sends them", () => {
    const parsed = examAttemptSchema.parse({
      ...base,
      status: "in_progress",
      questions: [{ ...question, answer: 1, explanation: "Because." }],
    });
    expect(parsed.questions[0]).toEqual(question);
  });

  test("a submitted attempt carries the score and per-question results", () => {
    const parsed = examAttemptSchema.parse({
      ...base,
      status: "submitted",
      score: 1,
      submittedAt: "2026-11-20T10:05:00.000Z",
      questions: [
        { ...question, chosen: 1, answer: 1, correct: true, explanation: "Because." },
      ],
    });
    expect(parsed.status).toBe("submitted");
  });
});
