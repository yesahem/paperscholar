import type { PublicProfile, UserCardList, UserSearchResult } from "@repo/shared";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { apiRequest, type CallOptions } from "./client";

/**
 * Public profiles, follows and user search (docs/specs/05-api.md §7). Each
 * schema mirrors the one in @repo/shared; the type annotation keeps them in step.
 */

const userCard = z.object({ username: z.string(), avatarUrl: z.nullable(z.string()) });

export const userSearchResultSchema: z.ZodMiniType<UserSearchResult> = z.object({
  items: z.array(userCard),
});

export const userCardListSchema: z.ZodMiniType<UserCardList> = z.object({
  items: z.array(userCard),
  nextCursor: z.nullable(z.string()),
});

export const publicProfileSchema: z.ZodMiniType<PublicProfile> = z.object({
  username: z.string(),
  avatarUrl: z.nullable(z.string()),
  bio: z.nullable(z.string()),
  joinedAt: z.string(),
  stats: z.object({
    problemsSolved: z.number(),
    papersCompleted: z.number(),
    easy: z.number(),
    medium: z.number(),
    hard: z.number(),
    currentStreak: z.number(),
    longestStreak: z.number(),
  }),
  papers: z.array(
    z.object({
      paperId: z.string(),
      solved: z.number(),
      total: z.number(),
      completedAt: z.nullable(z.string()),
    }),
  ),
  activity: z.array(z.object({ day: z.string(), solves: z.number() })),
  followingCount: z.number(),
  followerCount: z.number(),
  isFollowedByMe: z.nullable(z.boolean()),
});

/** Paper titles for naming papers on a profile: a part of `GET /v1/papers`. */
export const paperTitlesSchema = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string() })),
});
export type PaperTitles = z.infer<typeof paperTitlesSchema>;

const user = (username: string) => `/v1/users/${encodeURIComponent(username)}`;

export function getProfile(
  username: string,
  options: CallOptions = {},
): Promise<PublicProfile> {
  return apiRequest(user(username), publicProfileSchema, options);
}

export function getFollowing(
  username: string,
  cursor: string | null,
  options: CallOptions = {},
): Promise<UserCardList> {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return apiRequest(`${user(username)}/following?${query}`, userCardListSchema, options);
}

export function setFollowing(
  username: string,
  following: boolean,
  options: CallOptions = {},
): Promise<void> {
  return apiRequest(`${user(username)}/follow`, null, {
    method: following ? "PUT" : "DELETE",
    ...options,
  });
}

export function searchUsers(
  q: string,
  options: CallOptions = {},
): Promise<UserSearchResult> {
  return apiRequest(
    `/v1/users?${new URLSearchParams({ q })}`,
    userSearchResultSchema,
    options,
  );
}

export function getPaperTitles(options: CallOptions = {}): Promise<PaperTitles> {
  return apiRequest("/v1/papers", paperTitlesSchema, options);
}
