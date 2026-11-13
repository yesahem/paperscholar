import type { PaperSummary } from "@repo/shared";
import {
  CONTENT_TAGS,
  DIFFICULTIES,
  type ContentTag,
  type Difficulty,
} from "@repo/shared/vocabulary";

/** Catalogue filters, kept in the URL query string (docs/specs/08-web.md §6). */
export interface CatalogueFilter {
  query: string;
  tags: ContentTag[];
  difficulty: Difficulty | null;
}

export const EMPTY_FILTER: CatalogueFilter = { query: "", tags: [], difficulty: null };

const isTag = (value: string): value is ContentTag =>
  (CONTENT_TAGS as readonly string[]).includes(value);
const isDifficulty = (value: string): value is Difficulty =>
  (DIFFICULTIES as readonly string[]).includes(value);

/** Reads `?q=&tag=&tag=&difficulty=`, ignoring unknown values. */
export function parseCatalogueFilter(params: URLSearchParams): CatalogueFilter {
  const difficulty = params.get("difficulty") ?? "";
  return {
    query: (params.get("q") ?? "").trim().slice(0, 100),
    tags: [...new Set(params.getAll("tag").filter(isTag))],
    difficulty: isDifficulty(difficulty) ? difficulty : null,
  };
}

export function catalogueFilterToParams(filter: CatalogueFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.query.trim()) params.set("q", filter.query.trim());
  for (const tag of filter.tags) params.append("tag", tag);
  if (filter.difficulty) params.set("difficulty", filter.difficulty);
  return params;
}

/** Letters that Unicode does not decompose into a base letter and a mark. */
const FOLDED: Record<string, string> = {
  ł: "l",
  ø: "o",
  đ: "d",
  ß: "ss",
  æ: "ae",
  œ: "oe",
};

const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[łøđßæœ]/g, (letter) => FOLDED[letter] ?? letter);

/**
 * Papers matching every part of the filter: the title (or an author) contains
 * the query, the paper has all selected tags, and at least one problem of the
 * selected difficulty.
 */
export function filterPapers(
  papers: PaperSummary[],
  filter: CatalogueFilter,
): PaperSummary[] {
  const query = normalise(filter.query.trim());
  return papers.filter((paper) => {
    if (
      query &&
      !normalise(paper.title).includes(query) &&
      !paper.authors.some((author) => normalise(author).includes(query))
    ) {
      return false;
    }
    if (!filter.tags.every((tag) => paper.tags.includes(tag))) return false;
    if (filter.difficulty && paper.difficultyCounts[filter.difficulty] === 0)
      return false;
    return true;
  });
}

/** Tags used by at least one paper, alphabetically. */
export function tagsInUse(papers: PaperSummary[]): ContentTag[] {
  return [...new Set(papers.flatMap((paper) => paper.tags))].sort();
}
