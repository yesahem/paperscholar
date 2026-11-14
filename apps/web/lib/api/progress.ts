import type { LeaderboardPage, LeaderboardRank, ProgressList } from "@repo/shared";
import {
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_SORTS,
  type LeaderboardSort,
} from "@repo/shared/progress";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { apiRequest, type CallOptions } from "./client";

/**
 * Solves and rankings (docs/specs/05-api.md §7). Each schema mirrors the one
 * in @repo/shared; the type annotation keeps them in step.
 */

export const progressListSchema: z.ZodMiniType<ProgressList> = z.object({
  items: z.array(
    z.object({ paperId: z.string(), problemId: z.string(), solvedAt: z.string() }),
  ),
});

export const leaderboardPageSchema: z.ZodMiniType<LeaderboardPage> = z.object({
  sort: z.enum(LEADERBOARD_SORTS),
  items: z.array(
    z.object({
      rank: z.number(),
      username: z.string(),
      avatarUrl: z.nullable(z.string()),
      problemsSolved: z.number(),
      papersCompleted: z.number(),
      lastSolvedAt: z.nullable(z.string()),
    }),
  ),
  total: z.number(),
});

export const leaderboardRankSchema: z.ZodMiniType<LeaderboardRank> = z.object({
  rank: z.nullable(z.number()),
});

export function getProgress(options: CallOptions = {}): Promise<ProgressList> {
  return apiRequest("/v1/progress", progressListSchema, options);
}

export function getLeaderboard(
  sort: LeaderboardSort,
  offset: number,
  options: CallOptions = {},
): Promise<LeaderboardPage> {
  const query = new URLSearchParams({
    sort,
    limit: String(LEADERBOARD_PAGE_SIZE),
    offset: String(offset),
  });
  return apiRequest(`/v1/leaderboard?${query}`, leaderboardPageSchema, options);
}

export function getLeaderboardRank(
  sort: LeaderboardSort,
  options: CallOptions = {},
): Promise<LeaderboardRank> {
  return apiRequest(
    `/v1/leaderboard/me?${new URLSearchParams({ sort })}`,
    leaderboardRankSchema,
    options,
  );
}
