import { describe, expect, test } from "bun:test";
import { eq, schema } from "@repo/db";
import { demoPdf } from "@repo/pipeline";
import { silentLogger } from "@repo/shared/logger";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPipelineDeps } from "../../src/adapters/pipeline";
import { createEvals } from "../../src/services/evals";
import { createIngestions } from "../../src/services/ingestions";
import { DATABASE_URL, useTestDatabase } from "../database";
import { TEST_PIPELINE_LIMITS, testConfig, unusedSandbox } from "../helpers";

const SET = {
  papers: [
    { name: "first", source: "arxiv:1706.03762" },
    { name: "second", source: "arxiv:1412.6980" },
    { name: "local", source: "papers/local.pdf" },
  ],
};

describe.skipIf(!DATABASE_URL)("the eval", () => {
  const database = useTestDatabase();

  async function setup() {
    const root = await mkdtemp(join(tmpdir(), "evals-"));
    const config = testConfig({
      storage: { driver: "fs", root },
      pipeline: {
        llm: { driver: "fake", model: "fake-demo" },
        enabled: true,
        limits: TEST_PIPELINE_LIMITS,
      },
    });
    const deps = createPipelineDeps(config, {
      db: database.db,
      sandbox: unusedSandbox,
      logger: silentLogger,
    });
    if (!deps) throw new Error("the fake model should enable the pipeline");
    const fetched: string[] = [];
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      fetched.push(url);
      return new Response(demoPdf(url), {
        headers: { "content-type": "application/pdf" },
      });
    }) as typeof fetch;
    const ingestions = createIngestions({ deps, kick: () => {}, fetch: fakeFetch });
    const evals = createEvals({ deps, ingestions, set: SET });
    const userId = Bun.randomUUIDv7();
    await database.db.insert(schema.user).values({
      id: userId,
      name: "a",
      email: `${userId}@example.com`,
      username: `a${userId.replaceAll("-", "").slice(-12)}`,
      role: "admin",
    });
    return { evals, ingestions, fetched, userId };
  }

  test("there is no run until one is started", async () => {
    const { evals } = await setup();
    expect(await evals.latest()).toEqual({ run: null });
  });

  test("starts each arXiv paper once, says why another source could not start, and measures live", async () => {
    const { evals, fetched, userId } = await setup();
    const run = await evals.start(userId, { fresh: false }, "https://api.example.org");

    expect(fetched).toEqual([
      "https://arxiv.org/pdf/1706.03762",
      "https://arxiv.org/pdf/1412.6980",
    ]);
    expect(run).toMatchObject({ fresh: false, model: "fake-demo", startedBy: userId });
    expect(run.papers.map((paper) => [paper.name, paper.status, paper.running])).toEqual([
      ["first", "queued", true],
      ["second", "queued", true],
      ["local", null, false],
    ]);
    expect(run.papers[2]?.error).toBe(
      "Only arXiv sources can be evaluated from the CMS.",
    );
    expect(run.finished).toBe(false);
    expect(run.summary).toMatchObject({ papers: 2, steps: 0 });

    // The same run, read back: nothing about the figures was stored.
    const latest = await evals.latest();
    expect(latest.run?.id).toBe(run.id);
    expect(latest.run?.papers[0]?.measures).toMatchObject({ steps: 0, calls: 0 });
  });

  test("refuses a second run while one is unfinished, and allows one after", async () => {
    const { evals, userId } = await setup();
    const first = await evals.start(userId, { fresh: false }, "https://api.example.org");
    await expect(
      evals.start(userId, { fresh: false }, "https://api.example.org"),
    ).rejects.toMatchObject({ code: "conflict" });

    for (const paper of first.papers) {
      if (paper.ingestionId) {
        await database.db
          .update(schema.ingestions)
          .set({ status: "failed" })
          .where(eq(schema.ingestions.id, paper.ingestionId));
      }
    }
    const done = await evals.latest();
    expect(done.run?.finished).toBe(true);

    const second = await evals.start(userId, { fresh: false }, "https://api.example.org");
    // Failed ingestions are not reused: each paper gets a new one.
    expect(second.id).not.toBe(first.id);
    expect(second.papers[0]?.ingestionId).not.toBe(first.papers[0]?.ingestionId);
  });

  test("fresh cancels an unpublished ingestion and starts it again; a published one is measured as it stands", async () => {
    const { evals, userId } = await setup();
    const first = await evals.start(userId, { fresh: false }, "https://api.example.org");
    const [firstId, secondId] = [
      first.papers[0]?.ingestionId,
      first.papers[1]?.ingestionId,
    ];
    if (!firstId || !secondId) throw new Error("both arXiv papers should have started");
    await database.db
      .update(schema.ingestions)
      .set({ status: "published" })
      .where(eq(schema.ingestions.id, secondId));
    await database.db
      .update(schema.ingestions)
      .set({ status: "failed" })
      .where(eq(schema.ingestions.id, firstId));
    // Finish the third paper's slot: it never started, so the run is over.
    const again = await evals.start(userId, { fresh: true }, "https://api.example.org");
    expect(again.papers[1]?.ingestionId).toBe(secondId);
    expect(again.papers[0]?.ingestionId).not.toBe(firstId);
  });
});
