import { describe, expect, test } from "bun:test";
import { examDurationSeconds } from "../src/exams";

describe("examDurationSeconds", () => {
  test("allows 90 seconds per question, and never less than ten minutes", () => {
    expect(examDurationSeconds(5)).toBe(600);
    expect(examDurationSeconds(6)).toBe(600);
    expect(examDurationSeconds(7)).toBe(630);
    expect(examDurationSeconds(30)).toBe(2700);
  });
});
