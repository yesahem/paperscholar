import { describe, expect, test } from "bun:test";
import {
  completion,
  formatMinutes,
  needsFreshUrl,
  resumeFrom,
  watchedEnough,
} from "@/lib/courses/player";

describe("needsFreshUrl", () => {
  test("replaces a 300-second URL once a minute is left", () => {
    const fetched = 1_000_000;
    expect(needsFreshUrl(fetched, fetched + 239_000, 300)).toBe(false);
    expect(needsFreshUrl(fetched, fetched + 240_000, 300)).toBe(true);
    expect(needsFreshUrl(fetched, fetched + 10_000, 300, 295)).toBe(true);
  });
});

describe("resumeFrom", () => {
  test("resumes at the saved position, but restarts a finished lecture", () => {
    expect(resumeFrom(0, 540)).toBe(0);
    expect(resumeFrom(125, 540)).toBe(125);
    expect(resumeFrom(536, 540)).toBe(0);
    expect(resumeFrom(540, 540)).toBe(0);
  });
});

describe("watchedEnough", () => {
  test("completes a lecture at 90% watched", () => {
    expect(watchedEnough(485, 540)).toBe(false);
    expect(watchedEnough(486, 540)).toBe(true);
    expect(watchedEnough(10, 0)).toBe(false);
  });
});

describe("formatMinutes", () => {
  test("shows minutes, and hours past an hour", () => {
    expect(formatMinutes(20)).toBe("1 min");
    expect(formatMinutes(540)).toBe("9 min");
    expect(formatMinutes(3900)).toBe("1 h 05 min");
  });
});

describe("completion", () => {
  test("counts completed items that are still in the course", () => {
    expect(
      completion(
        ["a", "b", "c"],
        [
          { itemId: "a", completed: true },
          { itemId: "b", completed: false },
          { itemId: "gone", completed: true },
        ],
      ),
    ).toEqual({ done: 1, total: 3 });
  });
});
