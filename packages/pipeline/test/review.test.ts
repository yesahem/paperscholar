import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, schema } from "@repo/db";
import {
  addStep,
  cancelIngestion,
  createIngestion,
  DEMO_FILES,
  DEMO_MUTANTS,
  DEMO_PLAN,
  demoPdf,
  discardIngestion,
  getIngestionState,
  getStepFiles,
  ingestionKeys,
  LlmError,
  PipelineError,
  publishIngestion,
  publishReadiness,
  regenerateStep,
  removeStep,
  retryIngestion,
  reverifyStep,
  savePlan,
  saveStepFiles,
  updateDraft,
  waiveCheck,
} from "../src";
import { DATABASE_URL, drain, hasPython, useHarness } from "./harness";

setDefaultTimeout(240_000);

describe.skipIf(!DATABASE_URL || !hasPython)("reviewing and publishing a draft", () => {
  const harness = useHarness();

  async function ready(seed: string, answers = {}, options: unknown = {}) {
    const deps = harness.deps({ answers });
    const createdBy = await harness.newUser();
    const { id } = await createIngestion(deps, {
      pdf: demoPdf(seed),
      sourceType: "pdf",
      sourceRef: null,
      options,
      createdBy,
    });
    await drain(deps);
    return { deps, id, createdBy };
  }

  const stepStatus = async (id: string, stepId: string) =>
    (await getIngestionState(harness.db, id))?.steps.find(
      (step) => step.stepId === stepId,
    )?.status;

  test("a broken test blocks publishing until it is fixed and re-verified", async () => {
    const { deps, id, createdBy } = await ready("broken-test");
    expect(await publishReadiness(deps, id)).toEqual([]);

    const { current } = await getStepFiles(deps, id, "softmax");
    const broken = {
      ...current.files,
      testsPublic: current.files.testsPublic.replace("[1 / 3, 2 / 3]", "[1 / 2, 1 / 2]"),
    };
    await saveStepFiles(deps, id, "softmax", broken);
    expect(await stepStatus(id, "softmax")).toBe("edited");
    expect(await publishReadiness(deps, id)).toEqual([
      "softmax: has not been verified on its current files.",
    ]);
    await expect(publishIngestion(deps, id, createdBy)).rejects.toBeInstanceOf(
      PipelineError,
    );

    // Re-verifying the broken test fails V2; it still blocks.
    const failed = await reverifyStep(deps, id, "softmax", { full: false });
    expect(failed.verification?.passed).toBe(false);
    expect(failed.verification?.checks.find((check) => check.id === "V2")?.status).toBe(
      "failed",
    );
    expect(await stepStatus(id, "softmax")).toBe("edited");
    expect((await publishReadiness(deps, id)).join(" ")).toContain(
      "softmax: has not passed V2",
    );

    // Fixed, quick-verified: V7 and V8 have not run on these files, so a full check or a waiver is needed.
    await saveStepFiles(deps, id, "softmax", DEMO_FILES.softmax ?? current.files);
    const quick = await reverifyStep(deps, id, "softmax", { full: false });
    expect(quick.verification?.passed).toBe(true);
    expect((await publishReadiness(deps, id)).join(" ")).toContain(
      "softmax: has not passed V7",
    );

    const full = await reverifyStep(deps, id, "softmax", { full: true });
    expect(full.queued).toBe(true);
    await drain(deps);
    expect(await stepStatus(id, "softmax")).toBe("verified");
    expect(await publishReadiness(deps, id)).toEqual([]);

    const entry = await publishIngestion(deps, id, createdBy);
    expect(entry).toMatchObject({
      id: "linear-classifiers-from-scratch",
      status: "published",
      version: 1,
      source: "pipeline",
      publishedBy: createdBy,
    });
    expect(await harness.content.getDraft(entry.id)).toBeNull();
    const learnerDoc = await harness.content.getPublicDoc(entry.id, 1);
    expect(learnerDoc.problems).toHaveLength(4);
    expect(JSON.stringify(learnerDoc)).not.toContain(
      "np.exp(shifted)\n    return exponentials",
    );
    expect((await getIngestionState(harness.db, id))?.ingestion.status).toBe("published");

    // Editing the published paper: learners keep v1 until a verified v2 is published.
    await updateDraft(deps, id, {
      steps: (await getIngestionState(harness.db, id))?.steps.map((step) => ({
        stepId: step.stepId,
        title: step.stepId === "relu" ? "ReLU" : step.title,
      })),
    });
    const v2 = await publishIngestion(deps, id, createdBy);
    expect(v2.version).toBe(2);
    expect(v2.problems[0]?.title).toBe("ReLU");
  });

  test("a waiver with a reason lets an unverifiable V7 through", async () => {
    const { deps, id, createdBy } = await ready("waive");
    const { current } = await getStepFiles(deps, id, "relu");
    await saveStepFiles(deps, id, "relu", {
      ...current.files,
      tutorial: `${current.files.tutorial}\nEdited.\n`,
    });
    await reverifyStep(deps, id, "relu", { full: false });
    expect((await publishReadiness(deps, id)).join(" ")).toContain(
      "relu: has not passed V7",
    );
    expect((await publishReadiness(deps, id)).join(" ")).toContain(
      "relu: has not passed V8",
    );
    await waiveCheck(deps, id, "relu", {
      check: "V7",
      reason: "only the tutorial changed",
      by: createdBy,
    });
    await waiveCheck(deps, id, "relu", {
      check: "V8",
      reason: "only the tutorial changed",
      by: createdBy,
    });
    // A written waiver stands in for checks that did not run on these files.
    expect(await publishReadiness(deps, id)).toEqual([]);
    const entry = await publishIngestion(deps, id, createdBy);
    expect(entry.status).toBe("published");
    const [relu] = (await getIngestionState(harness.db, id))?.steps ?? [];
    expect(relu?.waivers).toMatchObject([
      { check: "V7", reason: "only the tutorial changed", by: createdBy },
      { check: "V8", reason: "only the tutorial changed", by: createdBy },
    ]);
  });

  test("regenerating a step adds the note to the prompt and starts a new round", async () => {
    const { deps, id, createdBy } = await ready("regenerate");
    await regenerateStep(deps, id, "relu", {
      note: "Use a leaky slope of 0.01 in the tutorial.",
      by: createdBy,
    });
    await drain(deps);
    const writes = deps.llm.calls.filter(
      (call) => call.purpose === "write" && call.subject === "relu",
    );
    expect(writes).toHaveLength(2);
    expect(writes[1]?.prompt).toContain("Use a leaky slope of 0.01 in the tutorial.");
    const state = await getIngestionState(harness.db, id);
    expect(state?.steps.find((step) => step.stepId === "relu")).toMatchObject({
      status: "verified",
      attempts: 2,
      attemptBase: 1,
    });
    expect(
      await harness.storage.head(ingestionKeys(id).attempt("relu", 1)),
    ).not.toBeNull();
    expect(
      await harness.storage.head(ingestionKeys(id).attempt("relu", 2)),
    ).not.toBeNull();
  });

  test("adding a step from a sentence plans, writes and verifies it", async () => {
    const extra = {
      ...DEMO_PLAN.steps[0],
      id: "leaky-relu",
      title: "Leaky ReLU",
      entryPoint: "relu",
    };
    const { deps, id, createdBy } = await ready("add-step", {
      plan: (request: { subject: string | null; prompt: string }) =>
        request.prompt.includes("asked for one more step") ? extra : DEMO_PLAN,
      write: (request: { subject: string | null }) => ({
        files:
          DEMO_FILES[request.subject === "leaky-relu" ? "relu" : (request.subject ?? "")],
        notes: "",
      }),
      mutants: (request: { subject: string | null }) => ({
        mutants:
          DEMO_MUTANTS[
            request.subject === "leaky-relu" ? "relu" : (request.subject ?? "")
          ] ?? [],
      }),
      solve: (request: { subject: string | null }) => ({
        solution:
          DEMO_FILES[request.subject === "leaky-relu" ? "relu" : (request.subject ?? "")]
            ?.solution ?? "",
      }),
    });
    await addStep(deps, id, {
      description: "A leaky variant of the rectifier.",
      by: createdBy,
    });
    await drain(deps);
    const state = await getIngestionState(harness.db, id);
    expect(state?.steps.map((step) => step.stepId)).toEqual([
      "relu",
      "softmax",
      "cross-entropy",
      "linear-classifier-loss",
      "leaky-relu",
    ]);
    expect(state?.steps.at(-1)).toMatchObject({ position: 4, status: "verified" });
  });

  test("steps cannot be removed or reordered out from under the steps that use them", async () => {
    const { deps, id } = await ready("structure");
    await expect(removeStep(deps, id, "softmax")).rejects.toThrow("build on softmax");
    const order = ["relu", "cross-entropy", "softmax", "linear-classifier-loss"].map(
      (stepId) => ({ stepId, title: stepId }),
    );
    await expect(updateDraft(deps, id, { steps: order })).rejects.toThrow(
      "cross-entropy builds on softmax",
    );
    await removeStep(deps, id, "relu");
    const state = await getIngestionState(harness.db, id);
    expect(state?.steps.map((step) => step.stepId)).toEqual([
      "softmax",
      "cross-entropy",
      "linear-classifier-loss",
    ]);
    await updateDraft(deps, id, {
      paper: {
        title: "Linear classifiers",
        authors: ["A. Author"],
        year: 2026,
        url: "https://example.org/paper",
        summary: "Edited.",
        tags: ["fundamentals"],
      },
    });
    const paperId = (await getIngestionState(harness.db, id))?.ingestion.paperId ?? "";
    const draft = await harness.content.getDraft(paperId);
    expect(draft?.public.paper.title).toBe("Linear classifiers");
    expect(draft?.public.problems.map((problem) => problem.id)).toEqual([
      "softmax",
      "cross-entropy",
      "linear-classifier-loss",
    ]);
  });

  test("an edited plan is saved and writing continues", async () => {
    const { deps, id } = await ready("plan-review", {}, { pauseAfterPlan: true });
    expect((await getIngestionState(harness.db, id))?.ingestion.status).toBe(
      "awaiting_plan_review",
    );
    await expect(
      savePlan(deps, id, { ...DEMO_PLAN, steps: DEMO_PLAN.steps.slice(0, 1) }),
    ).rejects.toThrow("the plan has 1 steps");
    const renamed = {
      ...DEMO_PLAN,
      steps: DEMO_PLAN.steps.map((step) =>
        step.id === "relu" ? { ...step, title: "The rectifier" } : step,
      ),
    };
    await savePlan(deps, id, renamed);
    await drain(deps);
    const state = await getIngestionState(harness.db, id);
    expect(state?.ingestion.status).toBe("ready_for_review");
    expect(state?.steps[0]?.title).toBe("The rectifier");
  });

  test("a failed ingestion resumes from its stage; cancel and discard clean up", async () => {
    let fail = true;
    const { deps, id } = await ready("retry", {
      plan: () => {
        if (fail) throw new LlmError("bad_request", "nope");
        return DEMO_PLAN;
      },
    });
    expect((await getIngestionState(harness.db, id))?.ingestion).toMatchObject({
      status: "failed",
      failedStage: "plan",
    });
    fail = false;
    expect(await retryIngestion(deps, id)).toBe("planning");
    await drain(deps);
    expect((await getIngestionState(harness.db, id))?.ingestion.status).toBe(
      "ready_for_review",
    );

    const paperId = (await getIngestionState(harness.db, id))?.ingestion.paperId ?? "";
    await cancelIngestion(deps, id);
    expect((await getIngestionState(harness.db, id))?.ingestion.status).toBe("cancelled");
    await discardIngestion(deps, id);
    expect(await getIngestionState(harness.db, id)).toBeNull();
    expect(await harness.content.getDraft(paperId)).toBeNull();
    const left: string[] = [];
    for await (const object of harness.storage.list(`ingestions/${id}/`))
      left.push(object.key);
    expect(left).toEqual([]);
    expect(
      await harness.db
        .select()
        .from(schema.ingestionSteps)
        .where(eq(schema.ingestionSteps.ingestionId, id)),
    ).toEqual([]);
  });
});
