import { describe, expect, test } from "bun:test";
import { feedbackItemSchema } from "@repo/shared";
import { toFeedbackItem } from "../../src/services/feedback";

/** Behaviour over HTTP is covered in test/routes/feedback.test.ts. */
describe("toFeedbackItem", () => {
  test("gives the author's view of a row, without the author's id", () => {
    const at = new Date("2026-11-20T10:00:00.000Z");
    const item = toFeedbackItem({
      id: "0190f0c1-1d2e-7a3b-8c4d-5e6f7a8b9c0d",
      userId: "user-1",
      type: "bug",
      rating: null,
      body: "The test is wrong",
      status: "open",
      paperId: "adam",
      problemId: "adam-step",
      createdAt: at,
      updatedAt: at,
    });
    expect(feedbackItemSchema.parse(item)).toEqual(item);
    expect(item).not.toHaveProperty("userId");
    expect(item.createdAt).toBe("2026-11-20T10:00:00.000Z");
  });
});
