import { schema, sql } from "@repo/db";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createLeaderboard } from "../../src/services/leaderboard";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { FAIL, PASS, solveHarness } from "../solve-harness";

describe.skipIf(!DATABASE_URL)("the leaderboard", () => {
  const database = useTestDatabase();
  let content: SyncedContent;
  const harness = solveHarness(
    () => database.db,
    () => content,
  );
  const leaderboard = () =>
    createLeaderboard({ db: database.db, avatarUrl: (key) => `/avatars/${key}` });
  const users: { id: string; username: string }[] = [];

  /**
   * Eight learners with solves at different times: ties on the count are
   * broken by who got there first, and one learner has only failures.
   */
  beforeAll(async () => {
    content = await syncedContent();
    const plan: [number, string[]][] = [
      [9, ["relu", "clipped", "second-paper/relu"]],
      [10, ["relu"]],
      [11, ["relu", "clipped"]],
      [12, ["second-paper/relu"]],
      [13, ["clipped", "relu"]],
      [14, []],
      [15, ["relu", "second-paper/relu"]],
      [16, ["relu", "clipped", "second-paper/relu"]],
    ];
    for (const [hour, solves] of plan) {
      const user = await harness.newUser();
      users.push(user);
      let minute = 0;
      for (const solve of solves) {
        const [paperId, problemId] = solve.includes("/")
          ? (solve.split("/") as [string, string])
          : ["rectifier-networks", solve];
        harness.clock.now = new Date(Date.UTC(2026, 10, 10, hour, minute));
        minute += 1;
        await harness.finish(user.id, PASS, { paperId, problemId });
      }
      if (solves.length === 0) await harness.finish(user.id, FAIL);
    }
  });
  afterAll(async () => {
    await content.cleanup();
  });

  /** The ranking computed from `progress` alone, ignoring `user_stats`. */
  async function fromProgress(order: string): Promise<string[]> {
    const rows = await database.db.execute<{ username: string }>(
      sql.raw(`
        select u.username
        from progress p
        join "user" u on u.id = p.user_id
        left join paper_completions c on c.user_id = p.user_id and c.paper_id = p.paper_id
        group by u.id, u.username
        order by ${order}
      `),
    );
    return rows.map((row) => row.username);
  }

  test("by problems solved, the order matches a direct query over progress", async () => {
    const page = await leaderboard().page({
      sort: "problems_solved",
      limit: 100,
      offset: 0,
    });
    const expected = await fromProgress(
      "count(distinct (p.paper_id, p.problem_id)) desc, max(p.solved_at) asc, u.id asc",
    );
    expect(page.items.map((item) => item.username)).toEqual(expected);
    expect(page.total).toBe(7);
    expect(page.items.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("by papers completed and by recent activity, too", async () => {
    const byPapers = await leaderboard().page({
      sort: "papers_completed",
      limit: 100,
      offset: 0,
    });
    expect(byPapers.items.map((item) => item.username)).toEqual(
      await fromProgress(
        "count(distinct c.paper_id) desc, max(p.solved_at) asc, u.id asc",
      ),
    );
    const recent = await leaderboard().page({
      sort: "recent_activity",
      limit: 100,
      offset: 0,
    });
    expect(recent.items.map((item) => item.username)).toEqual(
      await fromProgress("max(p.solved_at) desc, u.id asc"),
    );
  });

  test("someone with no solves is not listed and has no rank", async () => {
    const page = await leaderboard().page({
      sort: "problems_solved",
      limit: 100,
      offset: 0,
    });
    const idle = users[5];
    expect(page.items.some((item) => item.username === idle?.username)).toBe(false);
    expect(await leaderboard().rank(idle?.id ?? "", "problems_solved")).toBeNull();
    expect(await leaderboard().rank(Bun.randomUUIDv7(), "problems_solved")).toBeNull();
  });

  test("pages are positions: offset and limit slice the same order", async () => {
    const all = await leaderboard().page({
      sort: "problems_solved",
      limit: 100,
      offset: 0,
    });
    const second = await leaderboard().page({
      sort: "problems_solved",
      limit: 3,
      offset: 3,
    });
    expect(second.items).toEqual(all.items.slice(3, 6));
    expect(second.items[0]?.rank).toBe(4);
  });

  test("each user's rank is their position on the board, in every sort", async () => {
    for (const sort of [
      "problems_solved",
      "papers_completed",
      "recent_activity",
    ] as const) {
      const page = await leaderboard().page({ sort, limit: 100, offset: 0 });
      for (const item of page.items) {
        const user = users.find((candidate) => candidate.username === item.username);
        expect(await leaderboard().rank(user?.id ?? "", sort)).toBe(item.rank);
      }
    }
  });

  test("entries show counts and an avatar URL, and nothing private", async () => {
    const first = users[0];
    await database.db
      .insert(schema.profiles)
      .values({
        userId: first?.id ?? "",
        avatarKey: `avatars/${first?.id}/0190aaaa-0000-7000-8000-000000000000.webp`,
      })
      .onConflictDoNothing();
    const page = await leaderboard().page({
      sort: "problems_solved",
      limit: 100,
      offset: 0,
    });
    const entry = page.items.find((item) => item.username === first?.username);
    expect(entry).toEqual({
      rank: expect.any(Number),
      username: first?.username ?? "",
      avatarUrl: `/avatars/avatars/${first?.id}/0190aaaa-0000-7000-8000-000000000000.webp`,
      problemsSolved: 3,
      papersCompleted: 2,
      lastSolvedAt: "2026-11-10T09:02:00.000Z",
    });
  });
});
