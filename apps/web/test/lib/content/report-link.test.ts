import { SITE } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { problemReportUrl } from "@/lib/content/report-link";

describe("problemReportUrl", () => {
  test("prefills an issue naming the paper, the problem and the page", () => {
    const url = new URL(
      problemReportUrl({
        paperId: "adam",
        problemId: "adam-step",
        title: "Adam step & more",
        pageUrl: "https://example.com/papers/adam/problems/adam-step",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${SITE.repositoryUrl}/issues/new`);
    expect(url.searchParams.get("title")).toBe(
      "Problem with step: Adam step & more (adam/adam-step)",
    );
    expect(url.searchParams.get("body")).toContain(
      "https://example.com/papers/adam/problems/adam-step",
    );
    expect(url.searchParams.get("labels")).toBe("content");
  });
});
