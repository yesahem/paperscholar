import {
  extractPythonInterface,
  hashFiles,
  type PaperMetadata,
  type StoredProblemPrivate,
  type StoredProblemPublic,
} from "@repo/content";
import { asc, eq, schema, sql } from "@repo/db";
import type { PipelineDeps } from "../deps";
import type { TaskHandler } from "../engine/tick";
import { ingestionKeys } from "../keys";
import { requireJson, writeJson } from "../objects";
import {
  currentStepSchema,
  usageSchema,
  type CurrentStep,
  type IngestionReport,
  type Outline,
  type PlanStep,
} from "../schemas";
import {
  findStep,
  loadIngestion,
  loadOutline,
  loadPlan,
  STEP_LIMITS,
  type IngestionRow,
} from "./common";
import { stepFileList } from "./files";

const MAX_SLUG_LENGTH = 48;
const SUMMARY_LENGTH = 300;

/** `"Attention Is All You Need"` → `attention-is-all-you-need`, cut at a word boundary. */
export function slugify(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_SLUG_LENGTH) break;
    slug = next;
  }
  return slug || "paper";
}

/** A paper id not used by any paper, draft or other ingestion. */
async function allocatePaperId(
  deps: PipelineDeps,
  row: IngestionRow,
  title: string,
): Promise<string> {
  if (row.paperId) return row.paperId;
  const base = slugify(title);
  const index = await deps.content.getIndex({ fresh: true });
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (index.papers.some((paper) => paper.id === candidate)) continue;
    if (await deps.content.hasDraft(candidate)) continue;
    const taken = await deps.db.execute<{ taken: boolean }>(sql`
      select exists(
        select 1 from ingestions
        where paper_id = ${candidate} and id <> ${row.id} and status not in ('failed', 'cancelled')
      ) as taken
    `);
    if (taken[0]?.taken) continue;
    return candidate;
  }
  throw new Error(`no free paper id for ${base}`);
}

function clipSummary(summary: string): string {
  const text = summary.trim();
  if (text.length <= SUMMARY_LENGTH) return text;
  const cut = text.slice(0, SUMMARY_LENGTH - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 200 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

export function paperMetadata(
  outline: Outline,
  row: Pick<IngestionRow, "sourceRef">,
): PaperMetadata {
  const url = outline.url?.startsWith("https://")
    ? outline.url
    : row.sourceRef
      ? `https://arxiv.org/abs/${row.sourceRef}`
      : "";
  return {
    title: outline.title,
    authors: outline.authors,
    year: outline.year,
    url,
    summary: clipSummary(outline.summary),
    tags: [...new Set(outline.tags)],
  };
}

/** One step as the two halves of a stored problem (docs/specs/03-content.md §2.1). */
export function storedProblem(
  step: PlanStep,
  current: CurrentStep,
  order: number,
): { public: StoredProblemPublic; private: StoredProblemPrivate } {
  const { files } = current;
  return {
    public: {
      id: step.id,
      order,
      status: "published",
      title: step.title,
      summary: step.summary,
      difficulty: step.difficulty,
      type: step.type,
      entryPoint: step.entryPoint,
      environment: step.environment,
      allowedPackages: step.allowedPackages,
      prohibitedImports: step.prohibitedImports,
      ...STEP_LIMITS[step.environment],
      paperRefs: step.paperRefs,
      description: files.description,
      tutorial: files.tutorial,
      starter: files.starter,
      helpersInterface:
        files.helpers === null ? null : extractPythonInterface(files.helpers),
      contentHash: hashFiles([
        ...stepFileList(files),
        {
          path: "meta.json",
          content: JSON.stringify({ ...step, ...STEP_LIMITS[step.environment] }),
        },
      ]),
    },
    private: {
      id: step.id,
      solution: files.solution,
      testsPublic: files.testsPublic,
      testsHidden: files.testsHidden,
      helpers: files.helpers,
    },
  };
}

/** Stage 5 (§9): the draft paper and the ingestion report. */
export const assembleTask: TaskHandler = async (context) => {
  const { deps } = context;
  const row = await loadIngestion(context);
  const [outline, plan] = await Promise.all([loadOutline(context), loadPlan(context)]);
  const keys = ingestionKeys(row.id);
  const steps = await deps.db
    .select()
    .from(schema.ingestionSteps)
    .where(eq(schema.ingestionSteps.ingestionId, row.id))
    .orderBy(asc(schema.ingestionSteps.position));

  const currents = await Promise.all(
    steps.map((step) =>
      requireJson(deps.storage, keys.current(step.stepId), currentStepSchema),
    ),
  );
  const problems = steps.map((stepRow, order) =>
    storedProblem(findStep(plan, stepRow.stepId), currents[order] as CurrentStep, order),
  );

  const paperId = await allocatePaperId(deps, row, outline.title);
  await deps.content.putDraft({
    paperId,
    ingestionId: row.id,
    paper: paperMetadata(outline, row),
    problems: problems.map((problem) => problem.public),
    privateProblems: problems.map((problem) => problem.private),
  });

  const assembledAt = context.now();
  const report: IngestionReport = {
    ingestionId: row.id,
    paperId,
    model: row.model,
    promptVersion: row.promptVersion,
    startedAt: row.createdAt.toISOString(),
    assembledAt: assembledAt.toISOString(),
    durationMs: assembledAt.getTime() - row.createdAt.getTime(),
    usage: usageSchema.parse(row.usage),
    omitted: plan.omitted,
    steps: steps.map((stepRow, index) => ({
      stepId: stepRow.stepId,
      title: stepRow.title,
      status: stepRow.status === "verified" ? "verified" : "needs_attention",
      attempts: stepRow.attempts,
      checks: currents[index]?.verification?.checks ?? [],
    })),
  };
  await writeJson(deps.storage, keys.report, report);

  return async (tx) => {
    const now = context.now();
    await tx
      .update(schema.ingestions)
      .set({ status: "ready_for_review", paperId, finishedAt: now, updatedAt: now })
      .where(eq(schema.ingestions.id, row.id));
  };
};
