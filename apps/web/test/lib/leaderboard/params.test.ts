import { describe, expect, test } from "bun:test";
import {
  leaderboardViewToParams,
  offsetOf,
  pageCount,
  pageOfRank,
  parseLeaderboardView,
} from "@/lib/leaderboard/params";

describe("leaderboard view in the URL", () => {
  test("round-trips, leaving defaults out", () => {
    const view = { sort: "recent_activity" as const, page: 3 };
    expect(parseLeaderboardView(leaderboardViewToParams(view))).toEqual(view);
    expect(leaderboardViewToParams({ sort: "problems_solved", page: 1 }).toString()).toBe(
      "",
    );
  });

  test("anything unknown falls back to the first page by problems solved", () => {
    expect(parseLeaderboardView(new URLSearchParams("sort=karma&page=-2"))).toEqual({
      sort: "problems_solved",
      page: 1,
    });
    expect(parseLeaderboardView(new URLSearchParams("page=1.5")).page).toBe(1);
  });
});

describe("pages of 50", () => {
  test("map ranks, offsets and totals", () => {
    expect(offsetOf(1)).toBe(0);
    expect(offsetOf(3)).toBe(100);
    expect([1, 50, 51, 100, 101].map(pageOfRank)).toEqual([1, 1, 2, 2, 3]);
    expect([0, 1, 50, 51].map(pageCount)).toEqual([1, 1, 1, 2]);
  });
});
