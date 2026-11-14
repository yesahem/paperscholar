import { describe, expect, test } from "bun:test";
import {
  followingQuerySchema,
  LEADERBOARD_PAGE_SIZE,
  leaderboardQuerySchema,
  leaderboardRankQuerySchema,
  publicProfileSchema,
  usernameParamsSchema,
  userSearchQuerySchema,
  type PublicProfile,
} from "../../src";

describe("leaderboardQuerySchema", () => {
  test("defaults to the most problems solved, first page", () => {
    expect(leaderboardQuerySchema.parse({})).toEqual({
      sort: "problems_solved",
      limit: LEADERBOARD_PAGE_SIZE,
      offset: 0,
    });
  });

  test("reads numbers from the query string", () => {
    expect(
      leaderboardQuerySchema.parse({
        sort: "recent_activity",
        limit: "10",
        offset: "20",
      }),
    ).toEqual({ sort: "recent_activity", limit: 10, offset: 20 });
  });

  test("rejects unknown sorts, oversized pages, negative offsets and unknown fields", () => {
    for (const query of [
      { sort: "username" },
      { limit: "101" },
      { limit: "0" },
      { offset: "-1" },
      { page: "2" },
    ]) {
      expect(leaderboardQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  test("the rank query takes only a sort", () => {
    expect(leaderboardRankQuerySchema.parse({})).toEqual({ sort: "problems_solved" });
    expect(leaderboardRankQuerySchema.safeParse({ limit: "1" }).success).toBe(false);
  });
});

describe("usernameParamsSchema", () => {
  test("normalises the way usernames are stored", () => {
    expect(usernameParamsSchema.parse({ username: " Ada_L " })).toEqual({
      username: "ada_l",
    });
  });

  test("rejects anything that cannot be a username", () => {
    for (const username of ["a/b", "x".repeat(21), "", "dröm"]) {
      expect(usernameParamsSchema.safeParse({ username }).success).toBe(false);
    }
  });
});

describe("userSearchQuerySchema", () => {
  test("needs at least two characters", () => {
    expect(userSearchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(userSearchQuerySchema.parse({ q: "AD" })).toEqual({ q: "ad" });
  });

  test("refuses characters a username cannot contain, so no pattern reaches SQL", () => {
    for (const q of ["a%", "a_%", "ad min", "%%"]) {
      expect(userSearchQuerySchema.safeParse({ q }).success).toBe(false);
    }
  });
});

describe("followingQuerySchema", () => {
  test("defaults to 20 and caps at 100", () => {
    expect(followingQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(followingQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("publicProfileSchema", () => {
  const profile: PublicProfile = {
    username: "ada",
    avatarUrl: null,
    bio: null,
    joinedAt: "2026-11-14T00:00:00.000Z",
    stats: {
      problemsSolved: 1,
      papersCompleted: 0,
      easy: 1,
      medium: 0,
      hard: 0,
      currentStreak: 1,
      longestStreak: 1,
    },
    papers: [{ paperId: "p", solved: 1, total: 3, completedAt: null }],
    activity: [{ day: "2026-11-14", solves: 1 }],
    followingCount: 0,
    followerCount: 0,
    isFollowedByMe: null,
  };

  test("accepts a profile", () => {
    expect(publicProfileSchema.parse(profile)).toEqual(profile);
  });

  test("drops an email or role, should one ever be added by mistake", () => {
    const parsed = publicProfileSchema.parse({
      ...profile,
      email: "ada@example.com",
      role: "admin",
    });
    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("role");
  });

  test("activity days are calendar days", () => {
    expect(
      publicProfileSchema.safeParse({
        ...profile,
        activity: [{ day: "2026-11-14T00:00:00Z", solves: 1 }],
      }).success,
    ).toBe(false);
  });
});
