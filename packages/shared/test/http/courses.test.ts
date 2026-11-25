import { describe, expect, test } from "bun:test";
import {
  COURSE_NOTE_MAX_LENGTH,
  courseItemParamsSchema,
  putNoteSchema,
  putProgressSchema,
  submitExerciseSchema,
} from "../../src";

describe("putProgressSchema", () => {
  test("takes completion and a position in whole seconds", () => {
    expect(
      putProgressSchema.parse({ completed: false, lastWatchedSeconds: 125 }),
    ).toEqual({
      completed: false,
      lastWatchedSeconds: 125,
    });
  });

  test("refuses negative, fractional or absurd positions and unknown fields", () => {
    for (const body of [
      { completed: false, lastWatchedSeconds: -1 },
      { completed: false, lastWatchedSeconds: 1.5 },
      { completed: false, lastWatchedSeconds: 6 * 60 * 60 + 1 },
      { completed: "yes", lastWatchedSeconds: 1 },
      { completed: true, lastWatchedSeconds: 1, score: 3 },
    ]) {
      expect(putProgressSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("putNoteSchema", () => {
  test("allows an empty note, which clears it, up to the limit", () => {
    expect(putNoteSchema.safeParse({ body: "" }).success).toBe(true);
    expect(
      putNoteSchema.safeParse({ body: "x".repeat(COURSE_NOTE_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      putNoteSchema.safeParse({ body: "x".repeat(COURSE_NOTE_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });
});

describe("submitExerciseSchema", () => {
  test("takes an option index or null per question", () => {
    expect(submitExerciseSchema.parse({ answers: [1, null] })).toEqual({
      answers: [1, null],
    });
    expect(submitExerciseSchema.safeParse({ answers: [-1] }).success).toBe(false);
  });
});

describe("courseItemParamsSchema", () => {
  test("ids are slugs", () => {
    expect(
      courseItemParamsSchema.safeParse({ courseId: "a-b", itemId: "c" }).success,
    ).toBe(true);
    expect(
      courseItemParamsSchema.safeParse({ courseId: "../x", itemId: "c" }).success,
    ).toBe(false);
  });
});
