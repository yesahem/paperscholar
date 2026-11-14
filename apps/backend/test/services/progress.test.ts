import { eq, schema } from "@repo/db";
import type { SandboxProvider } from "@repo/runner";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  advanceStreak,
  checkStatsDrift,
  listSolves,
  previousDay,
  utcDayString,
} from "../../src/services/progress";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { captureLogger } from "../helpers";
import { FAIL, OURS, PASS, solveHarness } from "../solve-harness";

describe("days", () => {
  test("are UTC calendar days, whatever the local zone", () => {
    expect(utcDayString(new Date("2026-03-09T23:59:59.999Z"))).toBe("2026-03-09");
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(previousDay("2024-03-01")).toBe("2024-02-29");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
  });
});

describe("advanceStreak", () => {
  const start = { current: 0, longest: 0, lastActiveDay: null };

  test("the first active day starts a streak of one", () => {
    expect(advanceStreak(start, "2026-11-14")).toEqual({
      current: 1,
      longest: 1,
      lastActiveDay: "2026-11-14",
    });
  });

  test("a second pass on the same day changes nothing", () => {
    const streak = { current: 3, longest: 5, lastActiveDay: "2026-11-14" };
    expect(advanceStreak(streak, "2026-11-14")).toBe(streak);
  });

  test("the next day extends it and raises the longest when passed", () => {
    expect(
      advanceStreak(
        { current: 5, longest: 5, lastActiveDay: "2026-11-13" },
        "2026-11-14",
      ),
    ).toEqual({ current: 6, longest: 6, lastActiveDay: "2026-11-14" });
  });

  test("a missed day starts again at one, keeping the longest", () => {
    expect(
      advanceStreak(
        { current: 5, longest: 9, lastActiveDay: "2026-11-12" },
        "2026-11-14",
      ),
    ).toEqual({ current: 1, longest: 9, lastActiveDay: "2026-11-14" });
  });
});

describe.skipIf(!DATABASE_URL)("the solve transaction", () => {
  const database = useTestDatabase();
  let content: SyncedContent;
  const harness = solveHarness(
    () => database.db,
    () => content,
  );
  const { clock, finish, service } = harness;
  const newUser = async () => (await harness.newUser()).id;

  beforeAll(async () => {
    content = await syncedContent();
  });
  afterAll(async () => {
    await content.cleanup();
  });

  async function stats(userId: string) {
    const [row] = await database.db
      .select()
      .from(schema.userStats)
      .where(eq(schema.userStats.userId, userId));
    return row ?? null;
  }

  async function activity(userId: string) {
    return database.db
      .select({
        day: schema.dailyActivity.day,
        submissions: schema.dailyActivity.submissions,
        passedSubmits: schema.dailyActivity.passedSubmits,
        newSolves: schema.dailyActivity.newSolves,
      })
      .from(schema.dailyActivity)
      .where(eq(schema.dailyActivity.userId, userId))
      .orderBy(schema.dailyActivity.day);
  }

  test("a first passing submit records the solve and every counter exactly once", async () => {
    clock.now = new Date("2026-11-10T09:00:00.000Z");
    const userId = await newUser();
    const submissionId = await finish(userId, PASS);

    const [solve] = await database.db
      .select()
      .from(schema.progress)
      .where(eq(schema.progress.userId, userId));
    expect(solve).toMatchObject({
      paperId: "rectifier-networks",
      problemId: "relu",
      difficulty: "easy",
      firstSubmissionId: submissionId,
    });
    expect(await stats(userId)).toMatchObject({
      problemsSolved: 1,
      easySolved: 1,
      mediumSolved: 0,
      hardSolved: 0,
      papersCompleted: 0,
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDay: "2026-11-10",
      lastSolvedAt: clock.now,
    });
    expect(await activity(userId)).toEqual([
      { day: "2026-11-10", submissions: 1, passedSubmits: 1, newSolves: 1 },
    ]);
  });

  test("passing again changes nothing but the day's submission counts", async () => {
    clock.now = new Date("2026-11-10T09:00:00.000Z");
    const userId = await newUser();
    await finish(userId, PASS);
    const before = await stats(userId);
    clock.now = new Date("2026-11-10T10:00:00.000Z");
    await finish(userId, PASS);

    const after = await stats(userId);
    expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null });
    expect(
      await database.db
        .select()
        .from(schema.progress)
        .where(eq(schema.progress.userId, userId)),
    ).toHaveLength(1);
    expect(await activity(userId)).toEqual([
      { day: "2026-11-10", submissions: 2, passedSubmits: 2, newSolves: 1 },
    ]);
  });

  test("runs and failed submits count as submissions only; our errors count for nothing", async () => {
    clock.now = new Date("2026-11-10T09:00:00.000Z");
    const userId = await newUser();
    await finish(userId, PASS, { mode: "run" });
    await finish(userId, FAIL);
    await finish(userId, OURS);

    expect(await activity(userId)).toEqual([
      { day: "2026-11-10", submissions: 2, passedSubmits: 0, newSolves: 0 },
    ]);
    expect(
      await database.db
        .select()
        .from(schema.progress)
        .where(eq(schema.progress.userId, userId)),
    ).toHaveLength(0);
    // No passed submit yet: the row the sign-up hook would create is not needed.
    expect(await stats(userId)).toBeNull();
  });

  test("solving every published problem of a paper records one completion", async () => {
    clock.now = new Date("2026-11-10T09:00:00.000Z");
    const userId = await newUser();
    await finish(userId, PASS, { problemId: "relu" });
    expect((await stats(userId))?.papersCompleted).toBe(0);
    await finish(userId, PASS, { problemId: "clipped" });
    await finish(userId, PASS, { problemId: "clipped" });
    await finish(userId, PASS, { problemId: "relu", paperId: "second-paper" });

    const completions = await database.db
      .select()
      .from(schema.paperCompletions)
      .where(eq(schema.paperCompletions.userId, userId));
    expect(completions.map((row) => row.paperId).sort()).toEqual([
      "rectifier-networks",
      "second-paper",
    ]);
    expect(await stats(userId)).toMatchObject({
      problemsSolved: 3,
      easySolved: 2,
      mediumSolved: 1,
      papersCompleted: 2,
    });
  });

  test("streaks follow UTC days: extended the next day, reset after a gap", async () => {
    const userId = await newUser();
    clock.now = new Date("2026-11-10T23:30:00.000Z");
    await finish(userId, PASS);
    clock.now = new Date("2026-11-11T00:10:00.000Z");
    await finish(userId, PASS);
    expect(await stats(userId)).toMatchObject({ currentStreak: 2, longestStreak: 2 });
    clock.now = new Date("2026-11-14T12:00:00.000Z");
    await finish(userId, PASS);
    expect(await stats(userId)).toMatchObject({
      currentStreak: 1,
      longestStreak: 2,
      lastActiveDay: "2026-11-14",
    });
  });

  test("a run reaped while it ran records nothing", async () => {
    clock.now = new Date("2026-11-10T09:00:00.000Z");
    const userId = await newUser();
    const submissions = service();
    const { id } = await submissions.create(userId, {
      paperId: "rectifier-networks",
      problemId: "relu",
      code: "x = 1\n",
      mode: "submit",
    });
    const slow: SandboxProvider = {
      name: "slow",
      run: async () => {
        await database.db
          .update(schema.submissions)
          .set({ status: "error", verdict: "internal_error" })
          .where(eq(schema.submissions.id, id));
        return PASS;
      },
    };
    await service(slow).execute(id);
    expect(await activity(userId)).toEqual([]);
    expect(
      await database.db
        .select()
        .from(schema.progress)
        .where(eq(schema.progress.userId, userId)),
    ).toHaveLength(0);
  });

  test("GET /v1/progress lists every solve, oldest first", async () => {
    const userId = await newUser();
    clock.now = new Date("2026-11-10T09:00:00.000Z");
    await finish(userId, PASS, { problemId: "clipped" });
    clock.now = new Date("2026-11-10T09:05:00.000Z");
    await finish(userId, PASS, { problemId: "relu" });
    expect(await listSolves(database.db, userId)).toEqual({
      items: [
        {
          paperId: "rectifier-networks",
          problemId: "clipped",
          solvedAt: "2026-11-10T09:00:00.000Z",
        },
        {
          paperId: "rectifier-networks",
          problemId: "relu",
          solvedAt: "2026-11-10T09:05:00.000Z",
        },
      ],
    });
  });

  test("the drift check finds a counter that disagrees with progress, and nothing else", async () => {
    const userId = await newUser();
    clock.now = new Date("2026-11-10T09:00:00.000Z");
    await finish(userId, PASS);
    const { logger, lines } = captureLogger();
    const clean = await checkStatsDrift(database.db, logger, 10_000);
    expect(clean.filter((entry) => entry.userId === userId)).toEqual([]);

    await database.db
      .update(schema.userStats)
      .set({ problemsSolved: 7 })
      .where(eq(schema.userStats.userId, userId));
    const drift = await checkStatsDrift(database.db, logger, 10_000);
    expect(drift.filter((entry) => entry.userId === userId)).toEqual([
      { userId, field: "problemsSolved", stored: 7, derived: 1 },
    ]);
    expect(
      lines.some((line) => line.msg === "user stats drift" && line.userId === userId),
    ).toBe(true);
    await database.db
      .update(schema.userStats)
      .set({ problemsSolved: 1 })
      .where(eq(schema.userStats.userId, userId));
  });
});
