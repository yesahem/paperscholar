import {
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_SORTS,
  type LeaderboardSort,
} from "@repo/shared/progress";

export interface LeaderboardView {
  sort: LeaderboardSort;
  /** 1-based. */
  page: number;
}

export const SORT_LABELS: Record<LeaderboardSort, string> = {
  problems_solved: "Problems solved",
  papers_completed: "Papers completed",
  recent_activity: "Recently active",
};

const isSort = (value: string | null): value is LeaderboardSort =>
  LEADERBOARD_SORTS.some((sort) => sort === value);

/** Reads `?sort=&page=`; anything unknown falls back to the first page by problems solved. */
export function parseLeaderboardView(params: URLSearchParams): LeaderboardView {
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  return {
    sort: isSort(sort) ? sort : "problems_solved",
    page: Number.isInteger(page) && page >= 1 && page <= 20_000 ? page : 1,
  };
}

/** The query string for a view; the defaults are left out. */
export function leaderboardViewToParams({
  sort,
  page,
}: LeaderboardView): URLSearchParams {
  const params = new URLSearchParams();
  if (sort !== "problems_solved") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  return params;
}

export const offsetOf = (page: number) => (page - 1) * LEADERBOARD_PAGE_SIZE;

/** The page a 1-based rank appears on. */
export const pageOfRank = (rank: number) => Math.ceil(rank / LEADERBOARD_PAGE_SIZE);

export const pageCount = (total: number) =>
  Math.max(1, Math.ceil(total / LEADERBOARD_PAGE_SIZE));
