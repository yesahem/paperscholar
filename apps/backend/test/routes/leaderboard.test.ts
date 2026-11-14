import { eq, schema } from "@repo/db";
import type { SandboxProvider } from "@repo/runner";
import {
  leaderboardPageSchema,
  leaderboardRankSchema,
  progressListSchema,
  submissionCreatedSchema,
} from "@repo/shared";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestBrowser } from "../auth-client";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp } from "../helpers";
import { PASS } from "../solve-harness";

describe("/api/v1/leaderboard input", () => {
  test("an unknown sort or a page over 100 is a validation error", async () => {
    const { app } = createTestApp();
    for (const query of ["sort=username", "limit=101", "offset=-1", "page=2"]) {
      expect((await app.request(`/api/v1/leaderboard?${query}`)).status).toBe(400);
    }
  });

  test("the caller's own rank needs a session", async () => {
    const { app } = createTestApp();
    expect((await app.request("/api/v1/leaderboard/me")).status).toBe(401);
  });
});

describe.skipIf(!DATABASE_URL)("progress and the leaderboard over HTTP", () => {
  const database = useTestDatabase();
  let content: SyncedContent;
  const sandbox: SandboxProvider = { name: "passing", run: async () => PASS };

  beforeAll(async () => {
    content = await syncedContent();
  });
  afterAll(async () => {
    await content.cleanup();
  });

  test("a passed submit shows in progress, on the board and in the caller's rank", async () => {
    const { app, settle } = createTestApp({}, content.reader, {
      db: database.db,
      sandbox,
    });
    const browser = new TestBrowser(app);
    const username = `lb${Date.now().toString(36)}`;
    await browser.signUp({ email: `${username}@example.com`, username });

    // The sign-up hook creates the stats row, all zero.
    const [user] = await database.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.username, username));
    const [stats] = await database.db
      .select()
      .from(schema.userStats)
      .where(eq(schema.userStats.userId, user?.id ?? ""));
    expect(stats).toMatchObject({ problemsSolved: 0, currentStreak: 0 });
    expect(
      leaderboardRankSchema.parse(
        await (await browser.request("/api/v1/leaderboard/me")).json(),
      ),
    ).toEqual({ rank: null });

    const created = await browser.request("/api/v1/submissions", {
      method: "POST",
      body: {
        paperId: "rectifier-networks",
        problemId: "relu",
        code: "def relu(x):\n    return x\n",
        mode: "submit",
      },
    });
    submissionCreatedSchema.parse(await created.json());
    await settle();

    const progress = await browser.request("/api/v1/progress");
    expect(progress.headers.get("Cache-Control")).toBe("private, no-store");
    expect(progressListSchema.parse(await progress.json()).items).toEqual([
      { paperId: "rectifier-networks", problemId: "relu", solvedAt: expect.any(String) },
    ]);

    const board = leaderboardPageSchema.parse(
      await (
        await app.request("/api/v1/leaderboard?sort=recent_activity&limit=5")
      ).json(),
    );
    expect(board.items[0]).toMatchObject({ rank: 1, username, problemsSolved: 1 });
    expect(JSON.stringify(board)).not.toContain("@example.com");

    expect(
      leaderboardRankSchema.parse(
        await (
          await browser.request("/api/v1/leaderboard/me?sort=recent_activity")
        ).json(),
      ),
    ).toEqual({ rank: 1 });
  });
});
