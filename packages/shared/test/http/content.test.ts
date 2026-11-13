import { describe, expect, test } from "bun:test";
import {
  paperDetailSchema,
  problemDetailSchema,
  type PaperDetail,
  type ProblemDetail,
} from "../../src";

const firstProblem: PaperDetail["problems"][number] = {
  id: "positional-encoding",
  title: "Positional encoding",
  summary: "Sines and cosines.",
  difficulty: "easy",
  type: "micro",
  order: 1,
};

const paper: PaperDetail = {
  id: "attention-is-all-you-need",
  title: "Attention Is All You Need",
  authors: ["Ashish Vaswani"],
  year: 2017,
  summary: "The Transformer.",
  url: "https://arxiv.org/abs/1706.03762",
  tags: ["transformers"],
  problemCount: 1,
  difficultyCounts: { easy: 1, medium: 0, hard: 0 },
  problems: [firstProblem],
};

describe("content contract", () => {
  test("a paper with its problems parses unchanged", () => {
    expect(paperDetailSchema.parse(paper)).toEqual(paper);
  });

  test("a paper with an unknown tag is rejected", () => {
    const result = paperDetailSchema.safeParse({ ...paper, tags: ["astrology"] });
    expect(result.success).toBe(false);
  });

  test("a problem detail requires its limits and allows a null tutorial", () => {
    const problem: ProblemDetail = {
      ...firstProblem,
      paperId: paper.id,
      description: "Compute it.",
      tutorial: null,
      starter: "def f():\n    pass\n",
      entryPoint: "f",
      environment: "numpy",
      allowedPackages: ["numpy"],
      prohibitedImports: [],
      timeLimitSeconds: 2,
      memoryLimitMb: 256,
      paperRefs: ["§3.5"],
      helpersInterface: null,
    };
    expect(problemDetailSchema.parse(problem)).toEqual(problem);
    expect(
      problemDetailSchema.safeParse({ ...problem, timeLimitSeconds: 0 }).success,
    ).toBe(false);
  });
});
