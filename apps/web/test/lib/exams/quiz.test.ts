import { describe, expect, test } from "bun:test";
import { answersFor, formatRemaining, remainingMs, scoreSummary } from "@/lib/exams/quiz";

describe("remainingMs", () => {
  test("counts down to the deadline and stops at zero", () => {
    const now = Date.parse("2026-11-20T10:00:00.000Z");
    expect(remainingMs("2026-11-20T10:10:00.000Z", now)).toBe(600_000);
    expect(remainingMs("2026-11-20T09:59:00.000Z", now)).toBe(0);
  });
});

describe("formatRemaining", () => {
  test("shows minutes and seconds, rounding partial seconds up", () => {
    expect(formatRemaining(600_000)).toBe("10:00");
    expect(formatRemaining(61_001)).toBe("1:02");
    expect(formatRemaining(999)).toBe("0:01");
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(-5)).toBe("0:00");
  });

  test("adds hours past sixty minutes", () => {
    expect(formatRemaining(3_725_000)).toBe("1:02:05");
  });
});

describe("answersFor", () => {
  test("gives every question an entry, null where nothing was chosen", () => {
    expect(
      answersFor(
        4,
        new Map([
          [0, 2],
          [3, 0],
        ]),
      ),
    ).toEqual([2, null, null, 0]);
    expect(answersFor(0, new Map())).toEqual([]);
  });
});

describe("scoreSummary", () => {
  test("states the score and a rounded percentage", () => {
    expect(scoreSummary(7, 10)).toBe("7 of 10 (70%)");
    expect(scoreSummary(2, 3)).toBe("2 of 3 (67%)");
    expect(scoreSummary(0, 0)).toBe("0 of 0 (0%)");
  });
});
