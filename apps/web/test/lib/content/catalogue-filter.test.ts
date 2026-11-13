import type { PaperSummary } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import {
  catalogueFilterToParams,
  EMPTY_FILTER,
  filterPapers,
  parseCatalogueFilter,
  tagsInUse,
} from "@/lib/content/catalogue-filter";

const paper = (overrides: Partial<PaperSummary>): PaperSummary => ({
  id: "paper",
  title: "Paper",
  authors: [],
  year: 2020,
  summary: "",
  url: "https://example.com",
  tags: [],
  problemCount: 1,
  difficultyCounts: { easy: 1, medium: 0, hard: 0 },
  ...overrides,
});

const papers = [
  paper({
    id: "attention",
    title: "Attention Is All You Need",
    authors: ["Łukasz Kaiser"],
    tags: ["nlp", "transformers"],
    difficultyCounts: { easy: 1, medium: 2, hard: 0 },
  }),
  paper({ id: "adam", title: "Adam", tags: ["optimization"] }),
];

describe("catalogue filter", () => {
  test("parses the query string and drops unknown values", () => {
    const filter = parseCatalogueFilter(
      new URLSearchParams(
        "q=+attention+&tag=nlp&tag=nlp&tag=astrology&difficulty=extreme",
      ),
    );
    expect(filter).toEqual({ query: "attention", tags: ["nlp"], difficulty: null });
  });

  test("round-trips through the query string", () => {
    const filter = {
      query: "adam",
      tags: ["optimization" as const],
      difficulty: "easy" as const,
    };
    expect(parseCatalogueFilter(catalogueFilterToParams(filter))).toEqual(filter);
    expect(catalogueFilterToParams(EMPTY_FILTER).toString()).toBe("");
  });

  test("matches titles and authors, ignoring case and accents", () => {
    expect(filterPapers(papers, { ...EMPTY_FILTER, query: "ATTENTION" })).toHaveLength(1);
    expect(filterPapers(papers, { ...EMPTY_FILTER, query: "lukasz" })[0]?.id).toBe(
      "attention",
    );
  });

  test("requires every selected tag and a problem of the selected difficulty", () => {
    expect(
      filterPapers(papers, { ...EMPTY_FILTER, tags: ["nlp", "optimization"] }),
    ).toEqual([]);
    expect(
      filterPapers(papers, { ...EMPTY_FILTER, difficulty: "medium" }).map((p) => p.id),
    ).toEqual(["attention"]);
  });

  test("lists the tags in use", () => {
    expect(tagsInUse(papers)).toEqual(["nlp", "optimization", "transformers"]);
  });
});
