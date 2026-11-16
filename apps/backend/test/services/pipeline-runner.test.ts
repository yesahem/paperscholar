import { describe, expect, test } from "bun:test";
import { CONTENT_INDEX_LOCK, ContentStore } from "@repo/content";
import { createAdvisoryLock, eq, schema } from "@repo/db";
import {
  createIngestion,
  createScriptedLlm,
  DEFAULT_PIPELINE_SETTINGS,
  demoPaperAnswers,
  demoPdf,
  type PipelineDeps,
  type TaskHandlers,
} from "@repo/pipeline";
import { silentLogger } from "@repo/shared/logger";
import { FsStorage } from "@repo/storage";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPipelineRunner } from "../../src/services/pipeline-runner";
import { DATABASE_URL, useTestDatabase } from "../database";
import { unusedSandbox } from "../helpers";

/** Handlers that finish every stage at once, so only the engine is exercised. */
const instant: TaskHandlers = {
  read:
    async ({ task }) =>
    async (tx) => {
      await tx
        .update(schema.ingestions)
        .set({ status: "ready_for_review" })
        .where(eq(schema.ingestions.id, task.ingestionId));
    },
  plan: async () => async () => {},
  write: async () => async () => {},
  verify: async () => async () => {},
  assemble: async () => async () => {},
};

describe.skipIf(!DATABASE_URL)("createPipelineRunner", () => {
  const database = useTestDatabase();

  async function deps(
    settings: Partial<PipelineDeps["settings"]> = {},
  ): Promise<PipelineDeps> {
    const storage = new FsStorage({ root: await mkdtemp(join(tmpdir(), "runner-")) });
    return {
      db: database.db,
      storage,
      content: new ContentStore({
        storage,
        lock: createAdvisoryLock(database.db, CONTENT_INDEX_LOCK),
      }),
      llm: createScriptedLlm({ answers: demoPaperAnswers() }),
      sandbox: unusedSandbox,
      logger: silentLogger,
      settings: { ...DEFAULT_PIPELINE_SETTINGS, ...settings },
    };
  }

  const statusOf = async (id: string) =>
    (
      await database.db
        .select({ status: schema.ingestions.status })
        .from(schema.ingestions)
        .where(eq(schema.ingestions.id, id))
    )[0]?.status;

  test("in a long-running process, a kick works through the whole queue", async () => {
    const pipelineDeps = await deps({ concurrentIngestions: 1 });
    const ids = await Promise.all(
      ["p1", "p2", "p3"].map(
        async (seed) =>
          (
            await createIngestion(pipelineDeps, {
              pdf: demoPdf(seed),
              sourceType: "pdf",
              sourceRef: null,
              options: {},
              createdBy: null,
            })
          ).id,
      ),
    );
    const background: Promise<unknown>[] = [];
    const runner = createPipelineRunner({
      deps: pipelineDeps,
      logger: silentLogger,
      runInBackground: (task) => background.push(task),
      budgetMs: 10_000,
      mode: "process",
      handlers: instant,
    });
    runner.kick("http://localhost:8797");
    runner.kick("http://localhost:8797");
    expect(background).toHaveLength(1);
    await Promise.all(background);
    for (const id of ids) expect(await statusOf(id)).toBe("ready_for_review");
  });

  test("on serverless, an invocation ticks once and hands remaining work to the next", async () => {
    const pipelineDeps = await deps();
    const { id } = await createIngestion(pipelineDeps, {
      pdf: demoPdf("serverless"),
      sourceType: "pdf",
      sourceRef: null,
      options: {},
      createdBy: null,
    });
    const handedOver: string[] = [];
    const background: Promise<unknown>[] = [];
    // The first stage queues a second task, which this invocation leaves for the next.
    const twoStages: TaskHandlers = {
      ...instant,
      read:
        async ({ task }) =>
        async (tx) => {
          const { enqueue } = await import("@repo/pipeline");
          await enqueue(tx, task.ingestionId, "plan", "", new Date(Date.now() + 60_000));
        },
    };
    const runner = createPipelineRunner({
      deps: pipelineDeps,
      logger: silentLogger,
      runInBackground: (task) => background.push(task),
      budgetMs: 10_000,
      mode: "serverless",
      handlers: twoStages,
      continueAt: async (origin) => {
        handedOver.push(origin);
      },
    });
    runner.kick("https://api.example.org");
    await Promise.all(background);
    expect(handedOver).toEqual(["https://api.example.org"]);
    expect(await statusOf(id)).toBe("reading");
  });
});
