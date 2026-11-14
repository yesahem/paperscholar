import { schema, type Database } from "@repo/db";
import type { RunResult, SandboxProvider } from "@repo/runner";
import { silentLogger } from "@repo/shared/logger";
import type { SyncedContent } from "./content-fixture";
import { createRateLimiter } from "../src/services/rate-limiter";
import { createSubmissions } from "../src/services/submissions";
import { testConfig } from "./helpers";

function result(status: "passed" | "failed", tests = 1): RunResult {
  return {
    outcome: "completed",
    tests: Array.from({ length: tests }, (_, index) => ({
      name: `test_${index}`,
      group: "public" as const,
      status,
      durationMs: 1,
      message: null,
      traceback: null,
      stdout: null,
      timedOut: false,
    })),
    violations: [],
    errorOutput: null,
    durationMs: 5,
  };
}

export const PASS = result("passed");
export const FAIL = result("failed");
/** No tests at all is our failure (docs/specs/07-runner.md §7). */
export const OURS = result("passed", 0);

export interface FinishOptions {
  paperId?: string;
  problemId?: string;
  mode?: "run" | "submit";
}

/**
 * Produces solves the way learners do: through `createSubmissions`, with a
 * scripted sandbox and a clock each test sets.
 */
export function solveHarness(db: () => Database, content: () => SyncedContent) {
  let answer: RunResult = PASS;
  const provider: SandboxProvider = { name: "scripted", run: async () => answer };
  const clock = { now: new Date("2026-11-10T09:00:00.000Z") };

  function service(sandbox: SandboxProvider = provider) {
    return createSubmissions({
      db: db(),
      content: content().reader,
      provider: sandbox,
      limiter: createRateLimiter(db(), () => clock.now.getTime()),
      limits: { ...testConfig().limits, runsPerMinute: 1000, runsPerDay: 1000 },
      logger: silentLogger,
      dispatch: () => {},
      now: () => clock.now,
    });
  }

  return {
    clock,
    service,

    /** A user inserted directly, as Better Auth would, without the sign-up hook. */
    async newUser(username?: string): Promise<{ id: string; username: string }> {
      const id = Bun.randomUUIDv7();
      const name = username ?? `l${id.replaceAll("-", "").slice(-10)}`;
      await db()
        .insert(schema.user)
        .values({
          id,
          name,
          email: `${name}@example.com`,
          username: name,
        });
      return { id, username: name };
    },

    /** Creates and runs one submission whose run returns `outcome`; returns its id. */
    async finish(
      userId: string,
      outcome: RunResult = PASS,
      {
        paperId = "rectifier-networks",
        problemId = "relu",
        mode = "submit",
      }: FinishOptions = {},
    ): Promise<string> {
      answer = outcome;
      const submissions = service();
      const { id } = await submissions.create(userId, {
        paperId,
        problemId,
        code: "def relu(x):\n    return x\n",
        mode,
      });
      await submissions.execute(id);
      return id;
    },
  };
}
