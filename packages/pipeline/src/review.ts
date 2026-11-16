import { paperMetadataSchema, type IndexEntry } from "@repo/content";
import { and, eq, inArray, schema, sql, type Transaction } from "@repo/db";
import {
  MIN_PUBLISHED_STEPS,
  waiverSchema,
  type IngestionStatus,
  type UpdateDraft,
  type Waiver,
} from "@repo/shared";
import type { PipelineDeps } from "./deps";
import { enqueue } from "./engine/queue";
import type { TaskContext } from "./engine/tick";
import { PipelineError } from "./errors";
import { ingestionKeys, ingestionPrefix } from "./keys";
import { readJson, requireJson, writeJson } from "./objects";
import {
  checkPlan,
  currentStepSchema,
  outlineSchema,
  planSchema,
  type CurrentStep,
  type Plan,
  type PlanStep,
  type StepFiles,
  type Verification,
} from "./schemas";
import { buildDraftContents, writeDraft } from "./stages/assemble";
import { findStep, normaliseFiles, type IngestionRow } from "./stages/common";
import { hashStepFiles } from "./stages/files";
import { runChecks, summariseVerification, waivedChecks } from "./stages/verify";
import { z } from "zod";

/**
 * What a maintainer does on the review screen (docs/specs/09-paper-pipeline.md
 * §10–§12). Generated content changes only through these, and nothing reaches
 * learners until `publishIngestion` checks the rules of §11.
 */

type StepRow = typeof schema.ingestionSteps.$inferSelect;

/** States in which the draft can be reviewed and changed. */
const REVIEWABLE: readonly IngestionStatus[] = ["ready_for_review", "published"];
/** Quick checks, which every published step must have passed on its current files. */
const QUICK_CHECKS = ["V1", "V2", "V3", "V4", "V5", "V6", "V10"];
const WAIVABLE = ["V7", "V8"] as const;

const nowOf = (deps: PipelineDeps) => deps.now?.() ?? new Date();

async function loadRow(deps: PipelineDeps, id: string): Promise<IngestionRow> {
  const [row] = await deps.db
    .select()
    .from(schema.ingestions)
    .where(eq(schema.ingestions.id, id));
  if (!row) throw new PipelineError("not_found", "No ingestion has that id.");
  return row;
}

async function loadStepRow(
  deps: PipelineDeps,
  id: string,
  stepId: string,
): Promise<StepRow> {
  const [row] = await deps.db
    .select()
    .from(schema.ingestionSteps)
    .where(
      and(
        eq(schema.ingestionSteps.ingestionId, id),
        eq(schema.ingestionSteps.stepId, stepId),
      ),
    );
  if (!row) throw new PipelineError("not_found", `This ingestion has no step ${stepId}.`);
  return row;
}

function requireStatus(
  row: IngestionRow,
  allowed: readonly IngestionStatus[],
  action: string,
): void {
  if (!allowed.includes(row.status)) {
    throw new PipelineError(
      "invalid_state",
      `Cannot ${action} while the ingestion is ${row.status.replaceAll("_", " ")}.`,
    );
  }
}

/** Whether the pipeline still has work queued or running for this ingestion. */
async function hasOpenWork(
  deps: PipelineDeps,
  id: string,
  stepId?: string,
): Promise<boolean> {
  const rows = await deps.db.execute<{ open: boolean }>(sql`
    select exists(
      select 1 from pipeline_tasks
      where ingestion_id = ${id} and status in ('pending', 'running')
        ${stepId === undefined ? sql`` : sql`and key = ${stepId}`}
    ) as open
  `);
  return rows[0]?.open ?? false;
}

const updateStep = (
  tx: Transaction | PipelineDeps["db"],
  id: string,
  stepId: string,
  values: Partial<StepRow>,
) =>
  tx
    .update(schema.ingestionSteps)
    .set(values)
    .where(
      and(
        eq(schema.ingestionSteps.ingestionId, id),
        eq(schema.ingestionSteps.stepId, stepId),
      ),
    );

// ── Plan review (§6) ────────────────────────────────────────────────────────────

/**
 * Saves the plan a maintainer edited while the ingestion waited for plan
 * review, and continues to writing. Steps may be reordered, renamed, removed
 * or added; the plan's rules still apply.
 */
export async function savePlan(
  deps: PipelineDeps,
  id: string,
  plan: Plan,
): Promise<void> {
  const row = await loadRow(deps, id);
  requireStatus(row, ["awaiting_plan_review"], "change the plan");
  const keys = ingestionKeys(id);
  const outline = await requireJson(deps.storage, keys.outline, outlineSchema);
  const parsed = planSchema.parse(plan);
  const problems = checkPlan(parsed, outline, {
    min: deps.settings.minSteps,
    max: deps.settings.maxSteps,
  });
  if (problems.length > 0)
    throw new PipelineError(
      "invalid_state",
      `The plan breaks its rules: ${problems.join("; ")}.`,
    );
  await writeJson(deps.storage, keys.plan, parsed);
  const now = nowOf(deps);
  await deps.db.transaction(async (tx) => {
    await tx
      .delete(schema.ingestionSteps)
      .where(eq(schema.ingestionSteps.ingestionId, id));
    await tx.insert(schema.ingestionSteps).values(
      parsed.steps.map((step, position) => ({
        ingestionId: id,
        stepId: step.id,
        position,
        title: step.title,
      })),
    );
    await tx
      .update(schema.ingestions)
      .set({ status: "writing", updatedAt: now })
      .where(eq(schema.ingestions.id, id));
    for (const step of parsed.steps) await enqueue(tx, id, "write", step.id);
  });
}

// ── Editing steps (§10) ─────────────────────────────────────────────────────────

/** Saves a maintainer's edit of a step's files. The step is `edited` until re-verified. */
export async function saveStepFiles(
  deps: PipelineDeps,
  id: string,
  stepId: string,
  files: StepFiles,
): Promise<CurrentStep> {
  const row = await loadRow(deps, id);
  requireStatus(row, REVIEWABLE, "edit a step");
  await loadStepRow(deps, id, stepId);
  if (await hasOpenWork(deps, id, stepId)) {
    throw new PipelineError("conflict", "The pipeline is still working on this step.");
  }
  const now = nowOf(deps);
  const current: CurrentStep = {
    stepId,
    attempt: null,
    updatedAt: now.toISOString(),
    files: normaliseFiles(files),
    verification: null,
  };
  await writeJson(deps.storage, ingestionKeys(id).current(stepId), current);
  await updateStep(deps.db, id, stepId, {
    status: "edited",
    verification: null,
    updatedAt: now,
  });
  return current;
}

/** A context for running checks outside a task (the quick re-verify). */
function directContext(deps: PipelineDeps, id: string, stepId: string): TaskContext {
  return {
    deps,
    task: {
      id: "direct",
      ingestionId: id,
      kind: "verify",
      key: stepId,
      attempts: 1,
      failures: 0,
      leaseToken: "direct",
    },
    now: () => nowOf(deps),
    signal: new AbortController().signal,
  };
}

/**
 * Re-verifies a step on its current files. Quick (V1–V6, V10) runs now and
 * takes seconds; full also runs V7–V9 and is queued, because it calls the model.
 */
export async function reverifyStep(
  deps: PipelineDeps,
  id: string,
  stepId: string,
  { full }: { full: boolean },
): Promise<{ queued: boolean; verification: Verification | null }> {
  const row = await loadRow(deps, id);
  requireStatus(row, REVIEWABLE, "re-verify a step");
  const stepRow = await loadStepRow(deps, id, stepId);
  if (await hasOpenWork(deps, id, stepId)) {
    throw new PipelineError("conflict", "The pipeline is already working on this step.");
  }
  if (full) {
    // The step stays `edited` (or `verified`) while queued, so it is not repaired automatically.
    await deps.db.transaction(async (tx) => enqueue(tx, id, "verify", stepId));
    return { queued: true, verification: null };
  }
  const keys = ingestionKeys(id);
  const current = await requireJson(
    deps.storage,
    keys.current(stepId),
    currentStepSchema,
  );
  const plan = await requireJson(deps.storage, keys.plan, planSchema);
  const verification = await runChecks(
    directContext(deps, id, stepId),
    row,
    findStep(plan, stepId),
    current.files,
    waivedChecks(stepRow.waivers),
    { full: false },
  );
  await writeJson(deps.storage, keys.current(stepId), { ...current, verification });
  await updateStep(deps.db, id, stepId, {
    status: verification.passed ? "verified" : "edited",
    verification: summariseVerification(verification),
    updatedAt: nowOf(deps),
  });
  return { queued: false, verification };
}

/** Runs stages 3–4 again for a step, with the maintainer's note added to the prompt. */
export async function regenerateStep(
  deps: PipelineDeps,
  id: string,
  stepId: string,
  { note, by }: { note: string; by: string },
): Promise<void> {
  const row = await loadRow(deps, id);
  requireStatus(row, REVIEWABLE, "regenerate a step");
  const stepRow = await loadStepRow(deps, id, stepId);
  if (await hasOpenWork(deps, id, stepId)) {
    throw new PipelineError("conflict", "The pipeline is already working on this step.");
  }
  const keys = ingestionKeys(id);
  const current = await requireJson(
    deps.storage,
    keys.current(stepId),
    currentStepSchema,
  );
  await writeJson(deps.storage, keys.regenerate(stepId), {
    note,
    attemptBase: stepRow.attempts,
    files: current.files,
    requestedBy: by,
    requestedAt: nowOf(deps).toISOString(),
  });
  await deps.db.transaction(async (tx) => {
    await updateStep(tx, id, stepId, {
      status: "pending",
      attemptBase: stepRow.attempts,
      updatedAt: nowOf(deps),
    });
    await enqueue(tx, id, "write", stepId);
  });
}

/** Asks the planner for one more step, described in a sentence; stages 3–4 follow. */
export async function addStep(
  deps: PipelineDeps,
  id: string,
  { description, by }: { description: string; by: string },
): Promise<{ requestKey: string }> {
  const row = await loadRow(deps, id);
  requireStatus(row, REVIEWABLE, "add a step");
  const requestKey = `add-${crypto.randomUUID()}`;
  await writeJson(deps.storage, ingestionKeys(id).addStep(requestKey), {
    description,
    requestedBy: by,
    requestedAt: nowOf(deps).toISOString(),
  });
  await deps.db.transaction(async (tx) => enqueue(tx, id, "plan", requestKey));
  return { requestKey };
}

/** Removes a step. Refused while another step builds on it. */
export async function removeStep(
  deps: PipelineDeps,
  id: string,
  stepId: string,
): Promise<void> {
  const row = await loadRow(deps, id);
  requireStatus(row, REVIEWABLE, "remove a step");
  await loadStepRow(deps, id, stepId);
  if (await hasOpenWork(deps, id, stepId)) {
    throw new PipelineError("conflict", "The pipeline is still working on this step.");
  }
  const keys = ingestionKeys(id);
  const plan = await requireJson(deps.storage, keys.plan, planSchema);
  const dependents = plan.steps
    .filter((step) => step.dependsOn.includes(stepId))
    .map((step) => step.id);
  if (dependents.length > 0) {
    throw new PipelineError(
      "conflict",
      `Steps ${dependents.join(", ")} build on ${stepId}; remove or change them first.`,
    );
  }
  await writeJson(deps.storage, keys.plan, {
    ...plan,
    steps: plan.steps.filter((step) => step.id !== stepId),
  });
  await deps.db
    .delete(schema.ingestionSteps)
    .where(
      and(
        eq(schema.ingestionSteps.ingestionId, id),
        eq(schema.ingestionSteps.stepId, stepId),
      ),
    );
}

/** Paper metadata, step order and titles (`updateDraftSchema` in @repo/shared). */
export type DraftChanges = UpdateDraft;

/** Paper metadata, step order and titles: applied at once (§10). */
export async function updateDraft(
  deps: PipelineDeps,
  id: string,
  changes: DraftChanges,
): Promise<void> {
  const row = await loadRow(deps, id);
  requireStatus(row, REVIEWABLE, "edit the draft");
  if (changes.steps) {
    const existing = await deps.db
      .select({ stepId: schema.ingestionSteps.stepId })
      .from(schema.ingestionSteps)
      .where(eq(schema.ingestionSteps.ingestionId, id));
    const given = changes.steps.map((step) => step.stepId);
    const known = new Set(existing.map((step) => step.stepId));
    if (
      given.length !== known.size ||
      new Set(given).size !== given.length ||
      given.some((step) => !known.has(step))
    ) {
      throw new PipelineError(
        "invalid_state",
        "List every step exactly once to reorder them.",
      );
    }
    const plan = await requireJson(deps.storage, ingestionKeys(id).plan, planSchema);
    const position = new Map(given.map((stepId, index) => [stepId, index]));
    for (const step of plan.steps) {
      const late = step.dependsOn.find(
        (dependency) => (position.get(dependency) ?? 0) > (position.get(step.id) ?? 0),
      );
      if (late)
        throw new PipelineError(
          "invalid_state",
          `${step.id} builds on ${late}, so it must come after it.`,
        );
    }
    const ordered = changes.steps;
    await deps.db.transaction(async (tx) => {
      for (const [index, step] of ordered.entries()) {
        await updateStep(tx, id, step.stepId, {
          position: index,
          title: step.title,
          updatedAt: nowOf(deps),
        });
      }
    });
  }
  if (changes.paper) {
    await writeJson(
      deps.storage,
      ingestionKeys(id).paper,
      paperMetadataSchema.parse(changes.paper),
    );
  }
  // The draft object follows the review state, so it can be previewed as learners will see it.
  if (row.paperId && row.status === "ready_for_review") await writeDraft(deps, row);
}

/** Waives V7 or V8 for one step, with a written reason that is stored (§11). */
export async function waiveCheck(
  deps: PipelineDeps,
  id: string,
  stepId: string,
  { check, reason, by }: { check: (typeof WAIVABLE)[number]; reason: string; by: string },
): Promise<Waiver[]> {
  const row = await loadRow(deps, id);
  requireStatus(row, REVIEWABLE, "waive a check");
  const stepRow = await loadStepRow(deps, id, stepId);
  const waivers = z.array(waiverSchema).catch([]).parse(stepRow.waivers);
  const next: Waiver[] = [
    ...waivers.filter((waiver) => waiver.check !== check),
    { check, reason, by, at: nowOf(deps).toISOString() },
  ];
  // A failed check that is now waived no longer blocks the step.
  const keys = ingestionKeys(id);
  const current = await requireJson(
    deps.storage,
    keys.current(stepId),
    currentStepSchema,
  );
  let verification = current.verification;
  if (verification) {
    const checks = verification.checks.map((outcome) =>
      outcome.id === check && outcome.status === "failed"
        ? { ...outcome, status: "waived" as const }
        : outcome,
    );
    verification = {
      ...verification,
      checks,
      passed: checks.every((outcome) => outcome.status !== "failed"),
    };
    await writeJson(deps.storage, keys.current(stepId), { ...current, verification });
  }
  await updateStep(deps.db, id, stepId, {
    waivers: next,
    ...(verification
      ? {
          verification: summariseVerification(verification),
          status:
            verification.passed && verification.filesHash === hashStepFiles(current.files)
              ? "verified"
              : stepRow.status === "needs_attention"
                ? "needs_attention"
                : "edited",
        }
      : {}),
    updatedAt: nowOf(deps),
  });
  return next;
}

// ── Publishing (§11) ────────────────────────────────────────────────────────────

/** Why each step may not be published yet; empty when the draft can be published. */
export function publishProblems(steps: StepRow[], currents: CurrentStep[]): string[] {
  const problems: string[] = [];
  if (steps.length < MIN_PUBLISHED_STEPS) {
    problems.push(
      `A paper needs at least ${MIN_PUBLISHED_STEPS} steps; this one has ${steps.length}.`,
    );
  }
  steps.forEach((step, index) => {
    const current = currents[index];
    const verification = current?.verification;
    const name = `${step.stepId}:`;
    if (step.status === "needs_attention") {
      problems.push(`${name} needs attention; fix it or remove it.`);
      return;
    }
    if (
      !current ||
      !verification ||
      verification.filesHash !== hashStepFiles(current.files)
    ) {
      problems.push(`${name} has not been verified on its current files.`);
      return;
    }
    const status = (id: string) =>
      verification.checks.find((check) => check.id === id)?.status;
    const waived = waivedChecks(step.waivers);
    const failedQuick = QUICK_CHECKS.filter((id) => status(id) !== "passed");
    if (failedQuick.length > 0)
      problems.push(`${name} has not passed ${failedQuick.join(", ")}.`);
    for (const id of WAIVABLE) {
      const result = status(id);
      if (result !== "passed" && result !== "waived" && !waived.has(id)) {
        problems.push(
          `${name} has not passed ${id}; run the full check or waive it with a reason.`,
        );
      }
    }
    if (status("V9") === "failed")
      problems.push(`${name} has a blocking fidelity issue.`);
  });
  return problems;
}

/** Whether the draft may be published, and if not, why. */
export async function publishReadiness(
  deps: PipelineDeps,
  id: string,
): Promise<string[]> {
  const row = await loadRow(deps, id);
  if (!REVIEWABLE.includes(row.status))
    return [`The ingestion is ${row.status.replaceAll("_", " ")}.`];
  const { steps, currents } = await buildDraftContents(deps, row);
  return [
    ...((await hasOpenWork(deps, id))
      ? ["The pipeline is still working on this draft."]
      : []),
    ...publishProblems(steps, currents),
  ];
}

/**
 * Publishes the draft (§11): writes the next version and commits it through
 * content/index.json, then removes the draft. Republishing after edits writes
 * a new version; learners only ever see verified content.
 */
export async function publishIngestion(
  deps: PipelineDeps,
  id: string,
  by: string,
): Promise<IndexEntry> {
  const row = await loadRow(deps, id);
  requireStatus(row, REVIEWABLE, "publish");
  if (await hasOpenWork(deps, id))
    throw new PipelineError("conflict", "The pipeline is still working on this draft.");
  const { paperId } = await writeDraft(deps, row);
  const contents = await buildDraftContents(deps, { ...row, paperId });
  const problems = publishProblems(contents.steps, contents.currents);
  if (problems.length > 0)
    throw new PipelineError(
      "invalid_state",
      `Not ready to publish: ${problems.join(" ")}`,
    );

  const entry = await deps.content.publishVersion({
    paperId,
    source: "pipeline",
    status: "published",
    sourceHash: null,
    publishedBy: by,
    paper: contents.paper,
    problems: contents.problems.map((problem) => problem.public),
    privateProblems: contents.problems.map((problem) => problem.private),
  });
  await deps.content.deleteDraft(paperId);
  const now = nowOf(deps);
  await deps.db
    .update(schema.ingestions)
    .set({ status: "published", paperId, finishedAt: now, updatedAt: now })
    .where(eq(schema.ingestions.id, id));
  deps.logger.info("paper published from the pipeline", {
    ingestionId: id,
    paperId,
    version: entry.version,
  });
  return entry;
}

// ── Lifecycle (§12) ─────────────────────────────────────────────────────────────

/** Stops an ingestion at any time before it is published. */
export async function cancelIngestion(deps: PipelineDeps, id: string): Promise<void> {
  const row = await loadRow(deps, id);
  requireStatus(
    row,
    [
      "queued",
      "reading",
      "planning",
      "awaiting_plan_review",
      "writing",
      "ready_for_review",
      "failed",
    ],
    "cancel",
  );
  const now = nowOf(deps);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.ingestions)
      .set({ status: "cancelled", finishedAt: now, updatedAt: now })
      .where(eq(schema.ingestions.id, id));
    await tx
      .update(schema.pipelineTasks)
      .set({
        status: "failed",
        error: "stopped: the ingestion was cancelled",
        leaseToken: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.pipelineTasks.ingestionId, id),
          inArray(schema.pipelineTasks.status, ["pending", "running"]),
        ),
      );
  });
}

/** Resumes a failed ingestion from the stage it failed in. */
export async function retryIngestion(
  deps: PipelineDeps,
  id: string,
): Promise<IngestionStatus> {
  const row = await loadRow(deps, id);
  requireStatus(row, ["failed"], "retry");
  const stage = row.failedStage ?? "read";
  const now = nowOf(deps);
  const status: IngestionStatus =
    stage === "read" ? "queued" : stage === "plan" ? "planning" : "writing";
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.ingestions)
      .set({ status, error: null, failedStage: null, finishedAt: null, updatedAt: now })
      .where(eq(schema.ingestions.id, id));
    if (stage === "read") return enqueue(tx, id, "read");
    if (stage === "plan") return enqueue(tx, id, "plan");
    if (stage === "assemble") return enqueue(tx, id, "assemble");
    const steps = await tx
      .select()
      .from(schema.ingestionSteps)
      .where(eq(schema.ingestionSteps.ingestionId, id));
    let open = 0;
    for (const step of steps) {
      if (step.status === "pending" || step.status === "writing") {
        open += 1;
        await enqueue(tx, id, "write", step.stepId);
      } else if (step.status === "verifying") {
        open += 1;
        await enqueue(tx, id, "verify", step.stepId);
      }
    }
    if (open === 0) await enqueue(tx, id, "assemble");
  });
  return status;
}

/**
 * Discards an unpublished draft with all its working files (§10). A published
 * paper is archived instead, so learners' history stays meaningful.
 */
export async function discardIngestion(deps: PipelineDeps, id: string): Promise<void> {
  const row = await loadRow(deps, id);
  if (row.status === "published") {
    throw new PipelineError(
      "invalid_state",
      "A published paper cannot be discarded; archive it instead.",
    );
  }
  if (row.paperId) {
    const published = (await deps.content.getIndex({ fresh: true })).papers.some(
      (paper) => paper.id === row.paperId,
    );
    if (!published) await deps.content.deleteDraft(row.paperId);
  }
  for await (const object of deps.storage.list(ingestionPrefix(id)))
    await deps.storage.delete(object.key);
  if (row.llmFileId) {
    await deps.llm.deleteFile(row.llmFileId).catch((error: unknown) =>
      deps.logger.warn("could not delete the uploaded PDF at the model provider", {
        ingestionId: id,
        error,
      }),
    );
  }
  await deps.db.delete(schema.ingestions).where(eq(schema.ingestions.id, id));
}

/** A step's files as they stand, with what verification last said about them. */
export async function getStepFiles(
  deps: PipelineDeps,
  id: string,
  stepId: string,
): Promise<{ step: PlanStep; current: CurrentStep }> {
  await loadStepRow(deps, id, stepId);
  const keys = ingestionKeys(id);
  const [plan, current] = await Promise.all([
    requireJson(deps.storage, keys.plan, planSchema),
    readJson(deps.storage, keys.current(stepId), currentStepSchema),
  ]);
  if (!current) throw new PipelineError("not_found", `${stepId} has no files yet.`);
  return { step: findStep(plan, stepId), current };
}
