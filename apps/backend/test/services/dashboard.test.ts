import { describe, expect, test } from "bun:test";
import { schema } from "@repo/db";
import { createDashboard } from "../../src/services/dashboard";
import { DATABASE_URL, useTestDatabase } from "../database";

const NOW = new Date("2026-11-16T10:00:00.000Z");
const PIPELINE = {
  enabled: true,
  model: "fake-demo",
  promptVersion: "test",
  limits: { ingestionsPerDay: 10, concurrentIngestions: 2, outputTokenBudget: 600_000 },
};

describe.skipIf(!DATABASE_URL)("the dashboard", () => {
  const database = useTestDatabase();

  async function maintainer() {
    const id = Bun.randomUUIDv7();
    await database.db.insert(schema.user).values({
      id,
      name: "m",
      email: `${id}@example.com`,
      username: `m${id.replaceAll("-", "").slice(-12)}`,
      role: "maintainer",
    });
    return id;
  }

  async function ingest(
    createdBy: string,
    values: Partial<typeof schema.ingestions.$inferInsert> & { createdAt: Date },
  ) {
    const id = Bun.randomUUIDv7();
    await database.db.insert(schema.ingestions).values({
      id,
      sourceType: "pdf",
      pdfSha256: id,
      model: "fake-demo",
      promptVersion: "test",
      createdBy,
      updatedAt: values.createdAt,
      ...values,
    });
    return id;
  }

  test("counts, sums and ranks what is in the ingestions table", async () => {
    const userId = await maintainer();
    const today = new Date("2026-11-16T08:00:00.000Z");
    const twoDaysAgo = new Date("2026-11-14T08:00:00.000Z");
    const longAgo = new Date("2026-09-01T08:00:00.000Z");

    const big = await ingest(userId, {
      createdAt: today,
      title: "Big paper",
      status: "ready_for_review",
      usage: {
        calls: 10,
        inputTokens: 1000,
        outputTokens: 5000,
        cacheReadTokens: 400,
        sandboxRuns: 30,
      },
    });
    await database.db.insert(schema.ingestionSteps).values([
      { ingestionId: big, stepId: "one", position: 1, title: "One", status: "verified" },
      { ingestionId: big, stepId: "two", position: 2, title: "Two", status: "verified" },
    ]);
    await ingest(userId, {
      createdAt: twoDaysAgo,
      title: "Small paper",
      status: "failed",
      failedStage: "read",
      error: "This paper cannot become exercises: a survey.",
      usage: { calls: 2, inputTokens: 100, outputTokens: 300, sandboxRuns: 0 },
    });
    await ingest(userId, { createdAt: today, status: "writing", title: "Running" });
    await ingest(userId, {
      createdAt: longAgo,
      status: "published",
      usage: { outputTokens: 99_999 },
    });

    const dashboard = await createDashboard({
      db: database.db,
      pipeline: PIPELINE,
      now: () => NOW,
    }).read(7, userId);

    expect(dashboard.byStatus).toMatchObject({
      ready_for_review: 1,
      failed: 1,
      writing: 1,
      published: 1,
      queued: 0,
    });
    expect(dashboard.inFlight.map((row) => row.title)).toEqual(["Running"]);
    expect(dashboard.recentFailures).toEqual([
      expect.objectContaining({
        title: "Small paper",
        failedStage: "read",
        error: "This paper cannot become exercises: a survey.",
      }),
    ]);

    expect(dashboard.daily.map((day) => day.date)).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
    ]);
    expect(dashboard.daily[4]).toMatchObject({
      date: "2026-11-14",
      ingestions: 1,
      calls: 2,
      outputTokens: 300,
    });
    expect(dashboard.daily[6]).toMatchObject({
      date: "2026-11-16",
      ingestions: 2,
      calls: 10,
      inputTokens: 1000,
      outputTokens: 5000,
      cacheReadTokens: 400,
      sandboxRuns: 30,
    });
    expect(dashboard.daily[0]?.ingestions).toBe(0);

    // The window ends the paper from September out of the ranking.
    expect(dashboard.topPapers[0]).toMatchObject({
      id: big,
      outputTokens: 5000,
      steps: 2,
      sandboxRuns: 30,
    });
    expect(dashboard.topPapers.map((row) => row.outputTokens)).toEqual([5000, 300, 0]);

    expect(dashboard.limits).toEqual({
      ingestionsToday: { used: 2, max: 10 },
      concurrent: { used: 1, max: 2 },
      outputTokenBudget: 600_000,
    });
  });
});
