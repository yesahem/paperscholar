import { schema } from "@repo/db";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createProfiles, liveStreak } from "../../src/services/profiles";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { FAIL, PASS, solveHarness } from "../solve-harness";

describe("liveStreak", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  test("holds through today and yesterday, and has ended before that", () => {
    expect(liveStreak(4, "2026-11-14", now)).toBe(4);
    expect(liveStreak(4, "2026-11-13", now)).toBe(4);
    expect(liveStreak(4, "2026-11-12", now)).toBe(0);
    expect(liveStreak(0, null, now)).toBe(0);
  });
});

describe.skipIf(!DATABASE_URL)("profiles", () => {
  const database = useTestDatabase();
  let content: SyncedContent;
  const harness = solveHarness(
    () => database.db,
    () => content,
  );
  const now = new Date("2026-11-14T12:00:00.000Z");
  const profiles = () =>
    createProfiles({
      db: database.db,
      content: content.reader,
      avatarUrl: (key) => `https://avatars.example.com/${key}`,
      now: () => now,
    });

  beforeAll(async () => {
    content = await syncedContent();
  });
  afterAll(async () => {
    await content.cleanup();
  });

  test("a profile has stats, per-paper progress and recent activity, and no email or role", async () => {
    const user = await harness.newUser();
    harness.clock.now = new Date("2026-11-13T08:00:00.000Z");
    await harness.finish(user.id, PASS, { problemId: "relu" });
    await harness.finish(user.id, FAIL, { problemId: "clipped" });
    harness.clock.now = new Date("2026-11-14T08:00:00.000Z");
    await harness.finish(user.id, PASS, { paperId: "second-paper", problemId: "relu" });
    await harness.finish(user.id, PASS, { paperId: "second-paper", problemId: "relu" });
    // Older than a year: not in the heatmap.
    await database.db
      .insert(schema.dailyActivity)
      .values({ userId: user.id, day: "2025-11-14", submissions: 1, passedSubmits: 1 });

    const profile = await profiles().get(user.username, null);
    expect(profile).toEqual({
      username: user.username,
      avatarUrl: null,
      bio: null,
      joinedAt: expect.any(String),
      stats: {
        problemsSolved: 2,
        papersCompleted: 1,
        easy: 2,
        medium: 0,
        hard: 0,
        currentStreak: 2,
        longestStreak: 2,
      },
      papers: [
        {
          paperId: "second-paper",
          solved: 1,
          total: 1,
          completedAt: "2026-11-14T08:00:00.000Z",
        },
        { paperId: "rectifier-networks", solved: 1, total: 2, completedAt: null },
      ],
      activity: [
        { day: "2026-11-13", solves: 1 },
        { day: "2026-11-14", solves: 2 },
      ],
      followingCount: 0,
      followerCount: 0,
      isFollowedByMe: null,
    });
    const text = JSON.stringify(profile);
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain("role");
  });

  test("a new user reads as all zero, even without a stats row", async () => {
    const user = await harness.newUser();
    const profile = await profiles().get(user.username, null);
    expect(profile.stats).toEqual({
      problemsSolved: 0,
      papersCompleted: 0,
      easy: 0,
      medium: 0,
      hard: 0,
      currentStreak: 0,
      longestStreak: 0,
    });
    expect(profile.papers).toEqual([]);
    expect(profile.activity).toEqual([]);
  });

  test("an unknown username is not_found", async () => {
    await expect(profiles().get("nobody_here", null)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  test("follows are one-directional and idempotent, and counted on both sides", async () => {
    const ada = await harness.newUser();
    const bob = await harness.newUser();
    await profiles().follow(ada.id, bob.username);
    await profiles().follow(ada.id, bob.username);

    const bobSeenByAda = await profiles().get(bob.username, ada.id);
    expect(bobSeenByAda).toMatchObject({ followerCount: 1, isFollowedByMe: true });
    const adaSeenByBob = await profiles().get(ada.username, bob.id);
    expect(adaSeenByBob).toMatchObject({
      followingCount: 1,
      followerCount: 0,
      isFollowedByMe: false,
    });

    await profiles().unfollow(ada.id, bob.username);
    await profiles().unfollow(ada.id, bob.username);
    expect((await profiles().get(bob.username, ada.id)).isFollowedByMe).toBe(false);
  });

  test("nobody can follow themselves or an unknown user", async () => {
    const ada = await harness.newUser();
    await expect(profiles().follow(ada.id, ada.username)).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(profiles().follow(ada.id, "nobody_here")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  test("the following list pages newest first, without repeats", async () => {
    const ada = await harness.newUser();
    const followed: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const other = await harness.newUser();
      followed.push(other.username);
      await database.db.insert(schema.follows).values({
        followerId: ada.id,
        followeeId: other.id,
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)),
      });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await profiles().following(ada.username, { limit: 2, cursor });
      seen.push(...page.items.map((item) => item.username));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(followed.toReversed());
  });

  test("search matches a username prefix, alphabetically, at most ten", async () => {
    const prefix = `zq${Date.now().toString(36).slice(-4)}`;
    for (const suffix of [
      "b",
      "a",
      "c",
      ...Array.from({ length: 10 }, (_, i) => `x${i}`),
    ]) {
      await harness.newUser(`${prefix}_${suffix}`);
    }
    const result = await profiles().search(prefix);
    expect(result.items).toHaveLength(10);
    expect(result.items.slice(0, 3).map((item) => item.username)).toEqual([
      `${prefix}_a`,
      `${prefix}_b`,
      `${prefix}_c`,
    ]);
    expect(await profiles().search(`${prefix}_a`)).toEqual({
      items: [{ username: `${prefix}_a`, avatarUrl: null }],
    });
  });
});
