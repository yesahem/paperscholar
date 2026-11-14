import { eq, inArray, schema } from "@repo/db";
import { silentLogger } from "@repo/shared/logger";
import { describe, expect, test } from "bun:test";
import { runCleanup } from "../../src/services/cleanup";
import { createRateLimiter } from "../../src/services/rate-limiter";
import { createSubmissions } from "../../src/services/submissions";
import { DATABASE_URL, useTestDatabase } from "../database";
import { readOnlyStore, testConfig, unusedSandbox } from "../helpers";

const DAY = 86_400_000;

describe.skipIf(!DATABASE_URL)("runCleanup", () => {
  const database = useTestDatabase();

  test("reaps stale runs and applies retention, leaving everything recent alone", async () => {
    const db = database.db;
    const now = new Date();
    const userId = crypto.randomUUID();
    await db.insert(schema.user).values({
      id: userId,
      name: "Cleanup",
      email: `${userId}@example.com`,
      username: `clean${Date.now().toString(36)}`,
    });
    const row = (
      mode: "run" | "submit",
      ageMs: number,
      status: "completed" | "running" = "completed",
    ) => ({
      id: Bun.randomUUIDv7(),
      userId,
      paperId: "p",
      problemId: "q",
      mode,
      code: "x",
      status,
      contentVersion: "1",
      createdAt: new Date(now.getTime() - ageMs),
    });
    const oldRun = row("run", 31 * DAY);
    const oldSubmit = row("submit", 400 * DAY);
    const recentRun = row("run", DAY);
    const stuck = row("submit", 10 * 60_000, "running");
    await db.insert(schema.submissions).values([oldRun, oldSubmit, recentRun, stuck]);
    await db.insert(schema.rateLimitCounters).values([
      { key: `old:${userId}`, windowStart: new Date(now.getTime() - 2 * DAY), count: 1 },
      { key: `new:${userId}`, windowStart: new Date(now.getTime() - 60_000), count: 1 },
    ]);
    await db.insert(schema.verification).values([
      {
        id: crypto.randomUUID(),
        identifier: `gone:${userId}`,
        value: "v",
        expiresAt: new Date(now.getTime() - 1000),
      },
      {
        id: crypto.randomUUID(),
        identifier: `kept:${userId}`,
        value: "v",
        expiresAt: new Date(now.getTime() + DAY),
      },
    ]);

    const submissions = createSubmissions({
      db,
      content: readOnlyStore(),
      provider: unusedSandbox,
      limiter: createRateLimiter(db),
      limits: testConfig().limits,
      logger: silentLogger,
      dispatch: () => {},
    });
    const report = await runCleanup({ db, submissions, logger: silentLogger, now });
    expect(report.reapedSubmissions).toBeGreaterThanOrEqual(1);
    expect(report.deletedRunSubmissions).toBeGreaterThanOrEqual(1);
    expect(report.statsDrift).toBe(0);

    const left = await db
      .select({
        id: schema.submissions.id,
        status: schema.submissions.status,
        verdict: schema.submissions.verdict,
      })
      .from(schema.submissions)
      .where(eq(schema.submissions.userId, userId));
    const byId = new Map(left.map((entry) => [entry.id, entry]));
    expect(byId.has(oldRun.id)).toBe(false);
    // Submit-mode history is kept indefinitely.
    expect(byId.has(oldSubmit.id)).toBe(true);
    expect(byId.has(recentRun.id)).toBe(true);
    expect(byId.get(stuck.id)).toMatchObject({
      status: "error",
      verdict: "internal_error",
    });

    const counters = await db
      .select({ key: schema.rateLimitCounters.key })
      .from(schema.rateLimitCounters)
      .where(inArray(schema.rateLimitCounters.key, [`old:${userId}`, `new:${userId}`]));
    expect(counters.map((counter) => counter.key)).toEqual([`new:${userId}`]);
    const verifications = await db
      .select({ identifier: schema.verification.identifier })
      .from(schema.verification)
      .where(
        inArray(schema.verification.identifier, [`gone:${userId}`, `kept:${userId}`]),
      );
    expect(verifications.map((entry) => entry.identifier)).toEqual([`kept:${userId}`]);

    // Running it again changes nothing more.
    const again = await runCleanup({ db, submissions, logger: silentLogger, now });
    expect(again.deletedRunSubmissions).toBe(0);
    expect(again.reapedSubmissions).toBe(0);
  });
});
