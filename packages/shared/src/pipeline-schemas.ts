import { z } from "zod";
import { ENVIRONMENT_PACKAGES, slugSchema } from "./content";
import { PIPELINE_DEFAULTS } from "./pipeline";
import {
  CONTENT_TAGS,
  DIFFICULTIES,
  PROBLEM_TYPES,
  RUN_ENVIRONMENTS,
} from "./vocabulary";

/**
 * The shapes the pipeline asks the model for, keeps in storage and shows on
 * the maintainer screens (docs/specs/09-paper-pipeline.md §5–§9). Model answers are constrained to
 * these schemas and validated again on receipt. Every field is required
 * (nullable where it may be absent) because structured outputs work best that way.
 */

const pythonIdentifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const modulePath = z.string().regex(/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/);

// ── Intake ──────────────────────────────────────────────────────────────────────

export const ingestionOptionsSchema = z.strictObject({
  targetSteps: z
    .number()
    .int()
    .min(PIPELINE_DEFAULTS.minSteps)
    .max(PIPELINE_DEFAULTS.maxSteps)
    .nullable()
    .default(null),
  environment: z.enum(RUN_ENVIRONMENTS).nullable().default(null),
  focus: z.string().trim().max(500).nullable().default(null),
  pauseAfterPlan: z.boolean().default(false),
});
export type IngestionOptions = z.output<typeof ingestionOptionsSchema>;

// ── Stage 1: read and chunk ─────────────────────────────────────────────────────

export const chunkSchema = z.object({
  id: z.string().regex(/^c\d{2,3}$/, 'must look like "c01"'),
  heading: z.string(),
  pageStart: z.number().int(),
  pageEnd: z.number().int(),
  summary: z.string(),
  equations: z.array(
    z.object({ label: z.string(), latex: z.string(), meaning: z.string() }),
  ),
  algorithms: z.array(z.string()),
  implementable: z.boolean(),
});
export type Chunk = z.infer<typeof chunkSchema>;

export const outlineSchema = z
  .object({
    title: z.string().min(1),
    authors: z.array(z.string()),
    year: z.number().int().nullable(),
    url: z.string().nullable(),
    summary: z.string(),
    tags: z.array(z.enum(CONTENT_TAGS)),
    chunks: z.array(chunkSchema),
    suitability: z.object({ ok: z.boolean(), reason: z.string() }),
  })
  .superRefine((outline, context) => {
    const ids = outline.chunks.map((chunk) => chunk.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", path: ["chunks"], message: "chunk ids repeat" });
    }
    for (const [index, chunk] of outline.chunks.entries()) {
      if (chunk.pageEnd < chunk.pageStart || chunk.pageStart < 1) {
        context.addIssue({
          code: "custom",
          path: ["chunks", index, "pageStart"],
          message: "pages must be positive and in order",
        });
      }
    }
  });
export type Outline = z.infer<typeof outlineSchema>;

// ── Stage 2: plan ───────────────────────────────────────────────────────────────

export const planStepSchema = z
  .object({
    id: slugSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    concept: z.string(),
    chunkIds: z.array(z.string()),
    paperRefs: z.array(z.string()),
    type: z.enum(PROBLEM_TYPES),
    difficulty: z.enum(DIFFICULTIES),
    environment: z.enum(RUN_ENVIRONMENTS),
    entryPoint: pythonIdentifier,
    signature: z.string().min(1),
    allowedPackages: z.array(z.string()),
    prohibitedImports: z.array(modulePath),
    dependsOn: z.array(slugSchema),
  })
  .superRefine((step, context) => {
    const available: readonly string[] = ENVIRONMENT_PACKAGES[step.environment];
    for (const name of step.allowedPackages) {
      if (!available.includes(name)) {
        context.addIssue({
          code: "custom",
          path: ["allowedPackages"],
          message: `${name} is not installed in the ${step.environment} environment`,
        });
      }
      if (step.prohibitedImports.includes(name)) {
        context.addIssue({
          code: "custom",
          path: ["prohibitedImports"],
          message: `${name} cannot be both allowed and prohibited`,
        });
      }
    }
  });
export type PlanStep = z.infer<typeof planStepSchema>;

/** What the planner returns. Order and dependency rules are checked by `checkPlan`. */
export const planSchema = z.object({
  steps: z.array(planStepSchema),
  omitted: z.array(z.object({ what: z.string(), why: z.string() })),
});
export type Plan = z.infer<typeof planSchema>;

// ── Stage 3: write ──────────────────────────────────────────────────────────────

/** The files of one step, one string each (§7). */
export const stepFilesSchema = z.object({
  description: z.string().min(1),
  tutorial: z.string().min(1),
  starter: z.string().min(1),
  solution: z.string().min(1),
  testsPublic: z.string().min(1),
  testsHidden: z.string().min(1),
  /** Earlier steps' code this step imports as `helpers`; null when it needs none. */
  helpers: z.string().nullable(),
});
export type StepFiles = z.infer<typeof stepFilesSchema>;

/** What the writer returns: the files and a note on what changed, for repairs. */
export const writeAnswerSchema = z.object({
  files: stepFilesSchema,
  notes: z.string(),
});
export type WriteAnswer = z.infer<typeof writeAnswerSchema>;

// ── Stage 4: verify ─────────────────────────────────────────────────────────────

export const CHECK_IDS = [
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "V10",
] as const;
export type PipelineCheckId = (typeof CHECK_IDS)[number];

export const checkOutcomeSchema = z.object({
  id: z.enum(CHECK_IDS),
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped", "waived"]),
  details: z.array(z.string()),
});
export type CheckOutcome = z.infer<typeof checkOutcomeSchema>;

// ── Stage 4: the model-backed checks (V7–V9) ──────────────────────────────────

/** What the model returns for V7: plausible wrong implementations. */
export const mutantsAnswerSchema = z.object({
  mutants: z.array(z.object({ description: z.string().min(1), code: z.string().min(1) })),
});
export type MutantsAnswer = z.infer<typeof mutantsAnswerSchema>;

/** The model's judgement of mutants that survived: equivalent, or the tests are weak. */
export const equivalenceAnswerSchema = z.object({
  judgements: z.array(
    z.object({ index: z.number().int(), equivalent: z.boolean(), reason: z.string() }),
  ),
});
export type EquivalenceAnswer = z.infer<typeof equivalenceAnswerSchema>;

/** What the independent solver of V8 returns. */
export const solveAnswerSchema = z.object({ solution: z.string().min(1) });
export type SolveAnswer = z.infer<typeof solveAnswerSchema>;

export const fidelityIssueSchema = z.object({
  severity: z.enum(["blocking", "note"]),
  paperRef: z.string(),
  summary: z.string().min(1),
});
export type FidelityIssue = z.infer<typeof fidelityIssueSchema>;

/** What the reviewer of V9 returns. */
export const fidelityAnswerSchema = z.object({ issues: z.array(fidelityIssueSchema) });
export type FidelityAnswer = z.infer<typeof fidelityAnswerSchema>;

/**
 * One mutant and what the tests made of it. `invalid`: it crashed before any
 * test ran or broke the import policy, so it says nothing about the tests.
 */
export const mutantResultSchema = z.object({
  description: z.string(),
  code: z.string(),
  outcome: z.enum(["killed", "survived", "equivalent", "invalid"]),
  /** The tests that failed it, when killed. */
  killedBy: z.array(z.string()),
  /** Why it was judged equivalent, or why it is invalid. */
  reason: z.string().nullable(),
});
export type MutantResult = z.infer<typeof mutantResultSchema>;

/** The independent solver's run (V8). */
export const solveResultSchema = z.object({
  passed: z.boolean(),
  /** One or two: a second try sees only the failing tests' names and messages. */
  attempts: z.number().int(),
  solution: z.string(),
  /** Failing tests of the last attempt, as a learner would see them. */
  failures: z.array(z.string()),
});
export type SolveResult = z.infer<typeof solveResultSchema>;

/** The evidence of one verification of one attempt. */
export const verificationSchema = z.object({
  passed: z.boolean(),
  /** Whether V7–V9 ran; quick checks (V1–V6, V10) always do. */
  full: z.boolean(),
  checks: z.array(checkOutcomeSchema),
  sandboxRuns: z.number().int(),
  durationMs: z.number().int(),
  verifiedAt: z.iso.datetime({ offset: true }),
  /** Hash of the files that were checked, so edits invalidate the result. */
  filesHash: z.string(),
  /** V7's mutants, when it ran. */
  mutants: z.array(mutantResultSchema).nullable().default(null),
  /** V8's solver, when it ran. */
  solve: solveResultSchema.nullable().default(null),
  /** V9's issues, when it ran; notes are shown to the reviewer. */
  fidelity: z.array(fidelityIssueSchema).nullable().default(null),
});
export type Verification = z.infer<typeof verificationSchema>;

/** `steps/<stepId>/attempt-<n>.json` */
export const attemptRecordSchema = z.object({
  stepId: slugSchema,
  attempt: z.number().int().min(1),
  writtenAt: z.iso.datetime({ offset: true }),
  /** What the writer was told for this attempt, beyond the plan. */
  instructions: z.string().nullable(),
  notes: z.string(),
  files: stepFilesSchema,
  verification: verificationSchema.nullable(),
});
export type AttemptRecord = z.infer<typeof attemptRecordSchema>;

/** `steps/<stepId>/current.json`: the step's files as they stand. */
export const currentStepSchema = z.object({
  stepId: slugSchema,
  /** The attempt these files came from; null once a maintainer edited them. */
  attempt: z.number().int().min(1).nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
  files: stepFilesSchema,
  verification: verificationSchema.nullable(),
});
export type CurrentStep = z.infer<typeof currentStepSchema>;

// ── Stage 5: assemble ───────────────────────────────────────────────────────────

export const ingestionUsageSchema = z.object({
  calls: z.number().int().default(0),
  inputTokens: z.number().int().default(0),
  outputTokens: z.number().int().default(0),
  cacheReadTokens: z.number().int().default(0),
  cacheWriteTokens: z.number().int().default(0),
  sandboxRuns: z.number().int().default(0),
});
export type IngestionUsage = z.infer<typeof ingestionUsageSchema>;

export const reportSchema = z.object({
  ingestionId: z.uuid(),
  paperId: slugSchema,
  model: z.string(),
  promptVersion: z.string(),
  startedAt: z.iso.datetime({ offset: true }),
  assembledAt: z.iso.datetime({ offset: true }),
  durationMs: z.number().int(),
  usage: ingestionUsageSchema,
  omitted: planSchema.shape.omitted,
  steps: z.array(
    z.object({
      stepId: slugSchema,
      title: z.string(),
      status: z.enum(["verified", "needs_attention"]),
      attempts: z.number().int(),
      checks: z.array(checkOutcomeSchema),
    }),
  ),
});
export type IngestionReport = z.infer<typeof reportSchema>;
