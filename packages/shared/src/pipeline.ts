/**
 * Paper pipeline vocabulary and limits (docs/specs/09-paper-pipeline.md), as
 * plain constants so browser code can import them as `@repo/shared/pipeline`.
 */

/** Ingestion states (§12). `writing` covers writing and verifying the steps. */
export const INGESTION_STATUSES = [
  "queued",
  "reading",
  "planning",
  "awaiting_plan_review",
  "writing",
  "ready_for_review",
  "published",
  "failed",
  "cancelled",
] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

/** States in which the pipeline still has automatic work to do. */
export const ACTIVE_INGESTION_STATUSES = [
  "queued",
  "reading",
  "planning",
  "writing",
] as const satisfies readonly IngestionStatus[];

/** States an ingestion never leaves on its own. */
export const FINAL_INGESTION_STATUSES = [
  "published",
  "cancelled",
] as const satisfies readonly IngestionStatus[];

/** Step states (§12). */
export const STEP_STATUSES = [
  "pending",
  "writing",
  "verifying",
  "verified",
  "needs_attention",
  "edited",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** Task kinds of the execution engine (§13). */
export const TASK_KINDS = ["read", "plan", "write", "verify", "assemble"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_STATUSES = ["pending", "running", "done", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The stage an ingestion failed in, and resumes from on retry. */
export const PIPELINE_STAGES = ["read", "plan", "write", "assemble"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const INGESTION_SOURCE_TYPES = ["pdf", "arxiv"] as const;
export type IngestionSourceType = (typeof INGESTION_SOURCE_TYPES)[number];

/** Limits of §18, used as defaults for the instance settings. */
export const PIPELINE_DEFAULTS = {
  maxPdfBytes: 30 * 1024 * 1024,
  maxPdfPages: 60,
  minSteps: 4,
  maxSteps: 12,
  writeAttempts: 3,
  concurrentIngestions: 2,
  ingestionsPerDay: 10,
  /** Output tokens one ingestion may spend before it fails. */
  outputTokenBudget: 600_000,
} as const;

/** A draft needs at least this many steps to be published (§11). */
export const MIN_PUBLISHED_STEPS = 3;
