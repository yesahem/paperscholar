import type { PaperSummary } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { samplePaperId } from "@/lib/content/sample-problem";

const paper = (id: string, problemCount: number): PaperSummary => ({
  id,
  title: id,
  authors: [],
  year: null,
  summary: "",
  url: "https://example.com",
  tags: [],
  problemCount,
  difficultyCounts: { easy: problemCount, medium: 0, hard: 0 },
});

describe("samplePaperId", () => {
  test("prefers the first track's first paper that has problems", () => {
    const papers = [paper("a", 1), paper("b", 0), paper("c", 2)];
    const tracks = [{ id: "t", title: "T", summary: "", paperIds: ["b", "c", "a"] }];
    expect(samplePaperId(tracks, papers)).toBe("c");
  });

  test("falls back to the catalogue, and to nothing", () => {
    expect(samplePaperId([], [paper("a", 0), paper("b", 3)])).toBe("b");
    expect(samplePaperId([], [paper("a", 0)])).toBeNull();
  });
});
