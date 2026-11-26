import { describe, expect, test } from "bun:test";
import {
  COLD_MAIL_NOTES_MAX_LENGTH,
  coldMailDraftSchema,
  createColdMailSchema,
  type CreateColdMail,
} from "../../src";

const valid: CreateColdMail = {
  cvId: "0190f0c1-1d2e-7a3b-8c4d-5e6f7a8b9c0d",
  targetType: "professor",
  target: { name: "Dr. Ada Lovelace", organisation: "Analytical Engines Lab" },
  tone: "formal",
};

describe("createColdMailSchema", () => {
  test("takes a CV, a recipient and a tone; role and notes are optional", () => {
    expect(createColdMailSchema.parse(valid)).toEqual(valid);
    expect(
      createColdMailSchema.parse({
        ...valid,
        target: { ...valid.target, role: "PI", notes: "  Read her 2024 paper.  " },
      }).target.notes,
    ).toBe("Read her 2024 paper.");
  });

  test("refuses unknown types and tones, long notes, empty names and extra fields", () => {
    for (const body of [
      { ...valid, targetType: "recruiter" },
      { ...valid, tone: "casual" },
      {
        ...valid,
        target: { ...valid.target, notes: "x".repeat(COLD_MAIL_NOTES_MAX_LENGTH + 1) },
      },
      { ...valid, target: { ...valid.target, name: "  " } },
      { ...valid, target: { ...valid.target, url: "https://example.com" } },
      { ...valid, cvId: "not-a-uuid" },
      { ...valid, send: true },
    ]) {
      expect(createColdMailSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("coldMailDraftSchema", () => {
  test("is a subject, a body and a few highlights", () => {
    expect(
      coldMailDraftSchema.safeParse({
        subject: "Hello",
        body: "Dear…",
        highlights: ["ML"],
      }).success,
    ).toBe(true);
    expect(
      coldMailDraftSchema.safeParse({ subject: "", body: "x", highlights: [] }).success,
    ).toBe(false);
    expect(coldMailDraftSchema.safeParse({ subject: "s", body: "b" }).success).toBe(
      false,
    );
  });
});
