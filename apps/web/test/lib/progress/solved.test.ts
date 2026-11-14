import { describe, expect, test } from "bun:test";
import {
  continueTarget,
  solvedCount,
  solvedInPaper,
  solvedKeys,
} from "@/lib/progress/solved";

const at = "2026-11-14T00:00:00.000Z";
const solves = [
  { paperId: "attention", problemId: "softmax", solvedAt: at },
  { paperId: "attention", problemId: "retired-step", solvedAt: at },
  { paperId: "adam", problemId: "update", solvedAt: at },
];
const steps = [
  { id: "mask", order: 3 },
  { id: "softmax", order: 1 },
  { id: "scores", order: 2 },
];

describe("solved sets", () => {
  test("count solves per paper among the given problems", () => {
    const solved = solvedKeys(solves);
    expect(solvedCount(solved, "attention", ["softmax", "scores", "mask"])).toBe(1);
    expect(solvedCount(solved, "adam", ["softmax"])).toBe(0);
  });

  test("a paper's bar never passes its current problem count", () => {
    expect(solvedInPaper(solves, "attention", 3)).toBe(2);
    expect(solvedInPaper(solves, "attention", 1)).toBe(1);
    expect(solvedInPaper(solves, "unknown", 4)).toBe(0);
  });
});

describe("continueTarget", () => {
  test("starts at step one when nothing is solved", () => {
    expect(continueTarget("attention", steps, new Set())).toEqual({
      kind: "start",
      problemId: "softmax",
    });
  });

  test("continues at the first unsolved step in order", () => {
    expect(continueTarget("attention", steps, solvedKeys(solves))).toEqual({
      kind: "continue",
      problemId: "scores",
      order: 2,
    });
  });

  test("goes back to step one once everything is solved, and is null without steps", () => {
    const all = new Set(["attention/softmax", "attention/scores", "attention/mask"]);
    expect(continueTarget("attention", steps, all)).toEqual({
      kind: "done",
      problemId: "softmax",
    });
    expect(continueTarget("attention", [], all)).toBeNull();
  });
});
