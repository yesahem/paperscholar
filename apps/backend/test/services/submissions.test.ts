import { eq, schema } from "@repo/db";
import type { RunResult, SandboxProvider } from "@repo/runner";
import { silentLogger } from "@repo/shared/logger";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRateLimiter } from "../../src/services/rate-limiter";
import {
  createSubmissions,
  decodeCursor,
  encodeCursor,
  toSubmission,
  utcDay,
} from "../../src/services/submissions";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { testConfig } from "../helpers";

describe("utcDay", () => {
  test("is midnight to midnight in UTC, whatever the local zone", () => {
    const { start, end } = utcDay(new Date("2026-03-09T23:59:59.999Z"));
    expect(start.toISOString()).toBe("2026-03-09T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });
});

describe("cursors", () => {
  test("round-trip, and anything else is a validation error", () => {
    const id = "01890a5d-ac96-774b-bcce-b302099a8057";
    const createdAt = new Date("2026-11-14T10:00:00.123Z");
    expect(decodeCursor(encodeCursor(createdAt, id))).toEqual({ createdAt, id });
    for (const bad of [
      "garbage",
      Buffer.from('["x","y"]').toString("base64url"),
      Buffer.from(`["2026-01-01","not-uuid"]`).toString("base64url"),
    ]) {
      expect(() => decodeCursor(bad)).toThrow("The request is invalid.");
    }
  });
});

describe("toSubmission", () => {
  test("strips the traceback and output of hidden tests, even if stored", () => {
    const row = {
      id: "01890a5d-ac96-774b-bcce-b302099a8057",
      userId: "u",
      paperId: "p",
      problemId: "q",
      mode: "submit" as const,
      code: "x",
      status: "completed" as const,
      verdict: "failed" as const,
      testsPassed: 0,
      testsTotal: 1,
      result: {
        tests: [
          {
            name: "test_h",
            group: "hidden" as const,
            status: "failed" as const,
            durationMs: 1,
            message: "m",
            traceback: "secret frame",
            stdout: "secret output",
            timedOut: false,
          },
        ],
        violations: [],
        errorOutput: null,
      },
      durationMs: 5,
      contentVersion: "1",
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
    };
    expect(toSubmission(row).tests?.[0]).toMatchObject({
      traceback: null,
      stdout: null,
      message: "m",
    });
  });
});

describe.skipIf(!DATABASE_URL)("createSubmissions", () => {
  const database = useTestDatabase();
  let content: SyncedContent;
  beforeAll(async () => {
    content = await syncedContent();
  });
  afterAll(async () => {
    await content.cleanup();
  });

  test("execute is idempotent: a duplicate dispatch runs nothing", async () => {
    let runs = 0;
    const passed: RunResult = {
      outcome: "completed",
      tests: [],
      violations: [],
      errorOutput: null,
      durationMs: 1,
    };
    const provider: SandboxProvider = {
      name: "counting",
      run: async () => {
        runs += 1;
        return passed;
      },
    };
    const dispatched: string[] = [];
    const submissions = createSubmissions({
      db: database.db,
      content: content.reader,
      provider,
      limiter: createRateLimiter(database.db),
      limits: testConfig().limits,
      logger: silentLogger,
      dispatch: (id) => dispatched.push(id),
    });
    const userId = crypto.randomUUID();
    await database.db.insert(schema.user).values({
      id: userId,
      name: "Idempotent",
      email: `${userId}@example.com`,
      username: `idem${Date.now().toString(36)}`,
    });
    const { id } = await submissions.create(userId, {
      paperId: "rectifier-networks",
      problemId: "relu",
      code: "def relu(x):\n    return x\n",
      mode: "run",
    });
    expect(dispatched).toEqual([id]);
    await Promise.all([submissions.execute(id), submissions.execute(id)]);
    await submissions.execute(id);
    expect(runs).toBe(1);
    const [row] = await database.db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, id));
    // Zero tests is our fault, never a pass (docs/specs/07-runner.md §7).
    expect(row).toMatchObject({
      status: "error",
      verdict: "internal_error",
      contentVersion: "1",
    });
  });
});
