import { describe, expect, test } from "bun:test";
import {
  createFeedbackSchema,
  FEEDBACK_BODY_MAX_LENGTH,
  listFeedbackQuerySchema,
  setFeedbackStatusSchema,
  updateFeedbackSchema,
} from "../../src";

describe("createFeedbackSchema", () => {
  test("a review may carry a rating; the body is trimmed", () => {
    expect(
      createFeedbackSchema.parse({ type: "review", rating: 5, body: "  Great.  " }),
    ).toEqual({ type: "review", rating: 5, body: "Great." });
    expect(createFeedbackSchema.parse({ type: "review", body: "Fine" })).toEqual({
      type: "review",
      body: "Fine",
    });
  });

  test("a bug report names both the paper and the problem, or neither", () => {
    expect(
      createFeedbackSchema.safeParse({
        type: "bug",
        body: "The second test is wrong",
        paperId: "adam",
        problemId: "adam-step",
      }).success,
    ).toBe(true);
    expect(createFeedbackSchema.safeParse({ type: "bug", body: "Typo" }).success).toBe(
      true,
    );
    const half = createFeedbackSchema.safeParse({
      type: "bug",
      body: "Typo",
      paperId: "adam",
    });
    expect(half.success).toBe(false);
    expect(half.error?.issues[0]?.path).toEqual(["problemId"]);
  });

  test("rejects empty or oversized bodies, bad ratings, ratings on bugs and other types", () => {
    for (const body of [
      { type: "review", body: "   " },
      { type: "review", body: "x".repeat(FEEDBACK_BODY_MAX_LENGTH + 1) },
      { type: "review", rating: 0, body: "Meh" },
      { type: "review", rating: 6, body: "Wow" },
      { type: "review", rating: 4.5, body: "Hm" },
      { type: "bug", rating: 3, body: "Broken" },
      { type: "question", body: "Why?" },
      { type: "review", body: "Hi", paperId: "adam" },
    ]) {
      expect(createFeedbackSchema.safeParse(body).success).toBe(false);
    }
    expect(
      createFeedbackSchema.safeParse({
        type: "review",
        body: "x".repeat(FEEDBACK_BODY_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });
});

describe("updateFeedbackSchema", () => {
  test("changes the body, the rating, or clears the rating", () => {
    expect(updateFeedbackSchema.parse({ body: "Better" })).toEqual({ body: "Better" });
    expect(updateFeedbackSchema.parse({ rating: null })).toEqual({ rating: null });
  });

  test("refuses an empty change and a status change", () => {
    expect(updateFeedbackSchema.safeParse({}).success).toBe(false);
    expect(updateFeedbackSchema.safeParse({ status: "approved" }).success).toBe(false);
  });
});

describe("listFeedbackQuerySchema", () => {
  test("public lists are reviews; mine=1 lists the caller's own", () => {
    expect(listFeedbackQuerySchema.parse({ type: "review" })).toEqual({
      type: "review",
      limit: 20,
    });
    expect(listFeedbackQuerySchema.parse({ mine: "1", type: "bug" })).toEqual({
      mine: "1",
      type: "bug",
      limit: 20,
    });
  });

  test("bug reports are never listed publicly", () => {
    for (const query of [{}, { type: "bug" }, { mine: "0" }, { mine: "true" }]) {
      expect(listFeedbackQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe("setFeedbackStatusSchema", () => {
  test("accepts every status and nothing else", () => {
    for (const status of ["pending", "approved", "rejected", "open", "resolved"]) {
      expect(setFeedbackStatusSchema.safeParse({ status }).success).toBe(true);
    }
    expect(setFeedbackStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});
