import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, schema, sql } from "@repo/db";
import {
  createIngestion,
  DEMO_FILES,
  DEMO_PLAN,
  demoPdf,
  getIngestionState,
  ingestionKeys,
  LlmError,
  PIPELINE_HANDLERS,
  PipelineError,
  readJson,
  tick,
  reportSchema,
  type TaskHandlers,
} from "../src";
import { DATABASE_URL, drain, hasPython, testClock, useHarness } from "./harness";

// Each run drives dozens of real Python runs.
setDefaultTimeout(180_000);

describe.skipIf(!DATABASE_URL || !hasPython)("the pipeline with the fake model", () => {
  const harness = useHarness();

  async function start(seed: string, options: unknown = {}, depsOptions = {}) {
    const deps = harness.deps(depsOptions);
    const createdBy = await harness.newUser();
    const result = await createIngestion(deps, {
      pdf: demoPdf(seed),
      sourceType: "pdf",
      sourceRef: null,
      options,
      createdBy,
    });
    return { deps, id: result.id, result, createdBy };
  }

  async function doneTaskCounts(ingestionId: string) {
    const rows = await harness.db.execute<{
      kind: string;
      key: string;
      runs: number;
    }>(sql`
      select kind, key, count(*)::int as runs from pipeline_tasks
      where ingestion_id = ${ingestionId} and status = 'done'
      group by kind, key order by kind, key
    `);
    return rows.map((row) => `${row.kind}:${row.key}=${row.runs}`);
  }

  test("an upload goes all the way to ready_for_review, with a draft and a report", async () => {
    const { deps, id } = await start("full-run");
    await drain(deps);

    const state = await getIngestionState(harness.db, id);
    expect(state?.ingestion.status).toBe("ready_for_review");
    expect(state?.ingestion.title).toBe("Linear Classifiers from Scratch");
    expect(state?.steps.map((step) => [step.stepId, step.status, step.attempts])).toEqual(
      [
        ["relu", "verified", 1],
        ["softmax", "verified", 1],
        ["cross-entropy", "verified", 1],
        ["linear-classifier-loss", "verified", 1],
      ],
    );

    const paperId = state?.ingestion.paperId ?? "";
    expect(paperId).toBe("linear-classifiers-from-scratch");
    const draft = await harness.content.getDraft(paperId);
    expect(draft?.public.ingestionId).toBe(id);
    expect(draft?.public.problems.map((problem) => problem.id)).toEqual([
      "relu",
      "softmax",
      "cross-entropy",
      "linear-classifier-loss",
    ]);
    // Learners' half never carries solutions, tests or helper bodies.
    const publicJson = JSON.stringify(draft?.public);
    expect(publicJson).not.toContain("np.maximum(x, 0)");
    expect(publicJson).not.toContain("test_negative_values_become_zero");
    expect(draft?.public.problems[2]?.helpersInterface).toContain("def softmax(");
    expect(draft?.public.problems[2]?.helpersInterface).not.toContain("np.exp(shifted)");
    expect(draft?.private.problems[0]?.solution).toBe(DEMO_FILES.relu?.solution ?? "");
    // The index is untouched until a maintainer publishes.
    expect((await harness.content.getIndex({ fresh: true })).papers).toEqual([]);

    const report = await readJson(
      harness.storage,
      ingestionKeys(id).report,
      reportSchema,
    );
    expect(
      report?.steps.every((step) =>
        step.checks.every((check) => check.status === "passed"),
      ),
    ).toBe(true);
    expect(report?.usage.sandboxRuns).toBeGreaterThanOrEqual(20);

    // One read, one plan, a write and a verify per step, one assemble: nothing twice.
    expect(await doneTaskCounts(id)).toEqual([
      "assemble:=1",
      "plan:=1",
      "read:=1",
      "verify:cross-entropy=1",
      "verify:linear-classifier-loss=1",
      "verify:relu=1",
      "verify:softmax=1",
      "write:cross-entropy=1",
      "write:linear-classifier-loss=1",
      "write:relu=1",
      "write:softmax=1",
    ]);

    // Tokens are counted, and every call after the first reads the cached prefix.
    // read, plan, and per step: write, mutants, solve, fidelity; plus one
    // equivalence judgement for softmax's surviving mutant.
    expect(state?.usage.calls).toBe(19);
    expect(
      deps.llm.calls
        .filter((call) => call.purpose === "equivalence")
        .map((call) => call.subject),
    ).toEqual(["softmax"]);
    // The solver works alone: no paper, no outline, no plan.
    for (const call of deps.llm.calls.filter((call) => call.purpose === "solve")) {
      expect(call).toMatchObject({ hasDocument: false, context: 0 });
      expect(call.prompt).not.toContain("solution.py");
    }
    const after = await getIngestionState(harness.db, id);
    expect(after?.usage.cacheReadTokens).toBeGreaterThan(0);
    expect(deps.llm.uploads).toHaveLength(1);
    expect(deps.llm.calls.filter((call) => call.purpose === "write")).toHaveLength(4);
  });

  test("uploading the same PDF twice returns the existing ingestion", async () => {
    const { deps, id, createdBy } = await start("twice");
    const again = await createIngestion(deps, {
      pdf: demoPdf("twice"),
      sourceType: "pdf",
      sourceRef: null,
      options: {},
      createdBy,
    });
    expect(again).toEqual({ id, status: "queued", created: false });
    const [{ count } = { count: 0 }] = await harness.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.ingestions)
      .where(eq(schema.ingestions.id, id));
    expect(count).toBe(1);
  });

  test("intake refuses files that are not PDFs, and too many per day", async () => {
    const deps = harness.deps({ settings: { ingestionsPerDay: 1 } });
    const createdBy = await harness.newUser();
    const input = { sourceType: "pdf" as const, sourceRef: null, options: {}, createdBy };
    await expect(
      createIngestion(deps, { ...input, pdf: new TextEncoder().encode("<html></html>") }),
    ).rejects.toMatchObject({ code: "invalid_pdf" });
    await createIngestion(deps, { ...input, pdf: demoPdf("daily-1") });
    const second = createIngestion(deps, { ...input, pdf: demoPdf("daily-2") });
    await expect(second).rejects.toBeInstanceOf(PipelineError);
    await expect(second).rejects.toMatchObject({ code: "limit_reached" });
  });

  test("a worker that dies mid-task is replaced and nothing is done twice", async () => {
    const clock = testClock();
    const { deps, id } = await start("killed", {}, { now: clock.now });

    // The first worker hangs inside every write task, as if it had been killed.
    const hung: (() => void)[] = [];
    const dying: TaskHandlers = {
      ...PIPELINE_HANDLERS,
      write: async (context) => {
        const completion = await PIPELINE_HANDLERS.write(context);
        await new Promise<void>((resolve) => hung.push(resolve));
        return completion;
      },
    };
    const firstWorker = drain(deps, dying);
    while (hung.length < 3) await Bun.sleep(20);

    // The leases lapse; a second worker reclaims the same tasks and finishes the run.
    clock.advance(deps.settings.leaseMs + 1000);
    await drain(deps);
    expect((await getIngestionState(harness.db, id))?.ingestion.status).toBe(
      "ready_for_review",
    );

    // The first worker wakes up; its stale results are discarded.
    for (const resolve of hung) resolve();
    await firstWorker;

    const state = await getIngestionState(harness.db, id);
    expect(state?.ingestion.status).toBe("ready_for_review");
    expect(state?.steps.map((step) => step.attempts)).toEqual([1, 1, 1, 1]);
    expect(await doneTaskCounts(id)).toHaveLength(11);
    expect((await doneTaskCounts(id)).every((entry) => entry.endsWith("=1"))).toBe(true);
  });

  test("a task whose worker keeps dying is run again, not counted as a failure", async () => {
    const clock = testClock();
    const { deps, id } = await start("lapsed", {}, { now: clock.now });
    let lost = 0;
    const hung: (() => void)[] = [];
    const stale: Promise<unknown>[] = [];
    const flaky: TaskHandlers = {
      ...PIPELINE_HANDLERS,
      plan: async (context) => {
        // Six claims in a row lose their lease before finishing.
        if (lost < 6) {
          lost += 1;
          clock.advance(deps.settings.leaseMs + 1000);
          await new Promise<void>((resolve) => hung.push(resolve));
        }
        return PIPELINE_HANDLERS.plan(context);
      },
    };
    for (let round = 0; round < 6; round += 1) {
      stale.push(tick(deps, { handlers: flaky, concurrency: 1, budgetMs: 1000 }));
      while (lost <= round) await Bun.sleep(10);
    }
    await drain(deps, flaky);
    // The stale workers wake up; what they finish is discarded.
    for (const resolve of hung) resolve();
    await Promise.all(stale);
    const state = await getIngestionState(harness.db, id);
    expect(state?.ingestion.status).toBe("ready_for_review");
    expect(state?.tasks.find((task) => task.kind === "plan")?.attempts).toBe(7);
    expect(state?.steps.map((step) => step.attempts)).toEqual([1, 1, 1, 1]);
  });

  test("a failed check sends the step back to the writer with the evidence", async () => {
    let softmaxWrites = 0;
    const { deps, id } = await start(
      "repair",
      {},
      {
        answers: {
          write: (request: { subject: string | null }) => {
            const files = DEMO_FILES[request.subject ?? ""];
            if (request.subject !== "softmax" || !files) return { files, notes: "" };
            softmaxWrites += 1;
            if (softmaxWrites > 1) return { files, notes: "fixed the axis" };
            // Normalises over the whole array instead of along the axis.
            const solution =
              "import numpy as np\n\n\ndef softmax(x, axis=-1):\n    e = np.exp(x - np.max(x))\n    return e / e.sum()\n";
            return { files: { ...files, solution }, notes: "first try" };
          },
        },
      },
    );
    await drain(deps);

    const state = await getIngestionState(harness.db, id);
    const softmax = state?.steps.find((step) => step.stepId === "softmax");
    expect(softmax?.status).toBe("verified");
    expect(softmax?.attempts).toBe(2);
    const repairPrompt = deps.llm.calls.filter(
      (call) => call.purpose === "write" && call.subject === "softmax",
    )[1]?.prompt;
    expect(repairPrompt).toContain("failed verification");
    expect(repairPrompt).toContain("V2 Solution is correct");
    expect(state?.ingestion.status).toBe("ready_for_review");
  });

  test("a step that fails three times needs attention, and the others still finish", async () => {
    const { deps, id } = await start(
      "hopeless",
      {},
      {
        answers: {
          write: (request: { subject: string | null }) => {
            const files = DEMO_FILES[request.subject ?? ""];
            if (request.subject !== "relu" || !files) return { files, notes: "" };
            // The starter already passes, so V3 can never succeed.
            return { files: { ...files, starter: files.solution }, notes: "" };
          },
        },
      },
    );
    await drain(deps);

    const state = await getIngestionState(harness.db, id);
    expect(state?.steps.map((step) => [step.stepId, step.status, step.attempts])).toEqual(
      [
        ["relu", "needs_attention", 3],
        ["softmax", "verified", 1],
        ["cross-entropy", "verified", 1],
        ["linear-classifier-loss", "verified", 1],
      ],
    );
    expect(state?.ingestion.status).toBe("ready_for_review");
    const report = await readJson(
      harness.storage,
      ingestionKeys(id).report,
      reportSchema,
    );
    expect(report?.steps[0]?.status).toBe("needs_attention");
    expect(
      await harness.storage.head(ingestionKeys(id).attempt("relu", 3)),
    ).not.toBeNull();
  });

  test("a paper with nothing to implement fails with the model's reason", async () => {
    const { deps, id } = await start(
      "survey",
      {},
      {
        answers: {
          read: () => ({
            title: "A Survey of Surveys",
            authors: [],
            year: null,
            url: null,
            summary: "A survey.",
            tags: [],
            chunks: [],
            suitability: {
              ok: false,
              reason: "it is a survey with no method to implement",
            },
          }),
        },
      },
    );
    await drain(deps);
    const state = await getIngestionState(harness.db, id);
    expect(state?.ingestion.status).toBe("failed");
    expect(state?.ingestion.failedStage).toBe("read");
    expect(state?.ingestion.error).toBe(
      "This paper cannot become exercises: it is a survey with no method to implement",
    );
  });

  test("an overloaded model is retried; a rejected request fails the ingestion at once", async () => {
    const flaky = await start(
      "flaky",
      {},
      {
        answers: {
          plan: (_request: unknown, call: number) => {
            if (call === 1) throw new LlmError("overloaded", "overloaded");
            return DEMO_PLAN;
          },
        },
      },
    );
    await drain(flaky.deps);
    const recovered = await getIngestionState(harness.db, flaky.id);
    expect(recovered?.ingestion.status).toBe("ready_for_review");
    expect(recovered?.tasks.find((task) => task.kind === "plan")?.attempts).toBe(2);

    const rejected = await start(
      "rejected",
      {},
      {
        answers: {
          read: () => {
            throw new LlmError("bad_request", "the request was malformed");
          },
        },
      },
    );
    await drain(rejected.deps);
    const failed = await getIngestionState(harness.db, rejected.id);
    expect(failed?.ingestion.status).toBe("failed");
    expect(failed?.ingestion.error).toBe(
      "model call failed (bad_request): the request was malformed",
    );
    expect(failed?.tasks.find((task) => task.kind === "read")?.attempts).toBe(1);
  });

  test("an ingestion stops when its output-token budget is spent", async () => {
    const { deps, id } = await start(
      "budget",
      {},
      { settings: { outputTokenBudget: 1500 } },
    );
    await drain(deps);
    const state = await getIngestionState(harness.db, id);
    expect(state?.ingestion.status).toBe("failed");
    expect(state?.ingestion.error).toContain("output-token budget");
  });

  test("pauseAfterPlan stops for review before anything is written", async () => {
    const { deps, id } = await start("paused", { pauseAfterPlan: true });
    await drain(deps);
    const state = await getIngestionState(harness.db, id);
    expect(state?.ingestion.status).toBe("awaiting_plan_review");
    expect(state?.steps.every((step) => step.status === "pending")).toBe(true);
    expect(deps.llm.calls.map((call) => call.purpose)).toEqual(["read", "plan"]);
  });

  test("no more ingestions run at once than the instance allows", async () => {
    let active = 0;
    let peak = 0;
    const tracking: TaskHandlers = {
      ...PIPELINE_HANDLERS,
      read: async (context) => {
        active += 1;
        peak = Math.max(peak, active);
        await Bun.sleep(150);
        const completion = await PIPELINE_HANDLERS.read(context);
        return async (tx) => {
          active -= 1;
          await completion(tx);
        };
      },
    };
    const settings = { concurrentIngestions: 1 };
    const first = await start("lane-1", { pauseAfterPlan: true }, { settings });
    const second = await start("lane-2", { pauseAfterPlan: true }, { settings });
    await drain(first.deps, tracking);
    expect(peak).toBe(1);
    for (const id of [first.id, second.id]) {
      expect((await getIngestionState(harness.db, id))?.ingestion.status).toBe(
        "awaiting_plan_review",
      );
    }
  });
});
