import { describe, expect, test } from "bun:test";
import { reportLinks } from "@/lib/feedback/links";

describe("reportLinks", () => {
  test("a step report on a pipeline paper links to its review screen and the learner page", () => {
    expect(
      reportLinks(
        {
          paperId: "adam",
          problemId: "adam-step",
          ingestionId: "0190f0c1-1d2e-7a3b-8c4d-5e6f7a8b9c0d",
        },
        "https://example.com/",
      ),
    ).toEqual({
      review: "/ingestions/0190f0c1-1d2e-7a3b-8c4d-5e6f7a8b9c0d/review?step=adam-step",
      step: "https://example.com/papers/adam/problems/adam-step",
    });
  });

  test("a repository paper has no review screen; a general report has no step", () => {
    expect(
      reportLinks(
        { paperId: "adam", problemId: "adam-step", ingestionId: null },
        "https://example.com",
      ),
    ).toEqual({
      review: null,
      step: "https://example.com/papers/adam/problems/adam-step",
    });
    expect(
      reportLinks(
        { paperId: null, problemId: null, ingestionId: null },
        "https://example.com",
      ),
    ).toEqual({ review: null, step: null });
  });
});
