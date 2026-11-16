import type { ContentStore } from "@repo/content";
import type { Database } from "@repo/db";
import type { SandboxProvider } from "@repo/runner";
import { PIPELINE_DEFAULTS } from "@repo/shared";
import type { Logger } from "@repo/shared/logger";
import type { ObjectStorage } from "@repo/storage";
import type { LlmClient } from "./llm/types";

/** Instance settings of docs/specs/09-paper-pipeline.md §13 and §18. */
export interface PipelineSettings {
  maxPdfBytes: number;
  maxPdfPages: number;
  minSteps: number;
  maxSteps: number;
  writeAttempts: number;
  /** Ingestions reading, planning or writing at once; the rest wait queued. */
  concurrentIngestions: number;
  ingestionsPerDay: number;
  outputTokenBudget: number;
  /** Tasks of one ingestion running at once, to stay inside LLM rate limits. */
  tasksPerIngestion: number;
  /** How long a claimed task is protected from other workers. */
  leaseMs: number;
  /** Times one task may throw before the ingestion fails: the first run and three retries (§13). */
  maxTaskFailures: number;
  /**
   * Times one task may be claimed. A task whose lease lapses is simply run
   * again; this only stops a task that brings its worker down every time.
   */
  maxTaskClaims: number;
  /** First retry delay; doubled for each further retry. */
  retryBaseMs: number;
}

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  maxPdfBytes: PIPELINE_DEFAULTS.maxPdfBytes,
  maxPdfPages: PIPELINE_DEFAULTS.maxPdfPages,
  minSteps: PIPELINE_DEFAULTS.minSteps,
  maxSteps: PIPELINE_DEFAULTS.maxSteps,
  writeAttempts: PIPELINE_DEFAULTS.writeAttempts,
  concurrentIngestions: PIPELINE_DEFAULTS.concurrentIngestions,
  ingestionsPerDay: PIPELINE_DEFAULTS.ingestionsPerDay,
  outputTokenBudget: PIPELINE_DEFAULTS.outputTokenBudget,
  tasksPerIngestion: 3,
  leaseMs: 10 * 60 * 1000,
  maxTaskFailures: 4,
  maxTaskClaims: 20,
  retryBaseMs: 30_000,
};

/**
 * Everything the pipeline works with, passed in so the package imports no
 * vendor SDK and tests can substitute fakes (docs/specs/02-monorepo.md §4).
 */
export interface PipelineDeps {
  db: Database;
  /** The private bucket: ingestion working files and uploads. */
  storage: ObjectStorage;
  /** A writable content store (advisory-locked) over the same storage. */
  content: ContentStore;
  llm: LlmClient;
  sandbox: SandboxProvider;
  logger: Logger;
  settings: PipelineSettings;
  now?: () => Date;
}
