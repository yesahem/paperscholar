import { closeDb, createDb, eq, schema } from "@repo/db";
import {
  getIngestionState,
  PIPELINE_HANDLERS,
  tick,
  type IngestionState,
  type PipelineDeps,
} from "@repo/pipeline";
import { createLogger } from "@repo/shared/logger";
import { resolve } from "node:path";
import { createPipelineDeps, PROCESS_TICK_BUDGET_MS } from "../adapters/pipeline";
import { createSandboxProvider } from "../adapters/sandbox";
import type { AppConfig } from "../env";
import { TICK_CONCURRENCY } from "../services/pipeline-runner";

export interface PipelineServices {
  deps: PipelineDeps;
  close(): Promise<void>;
}

/**
 * The pipeline for a command, or null with a message when this instance has
 * no model configured (docs/specs/13-self-hosting.md §4).
 */
export function createPipelineServices(config: AppConfig): PipelineServices | null {
  const logger = createLogger({ level: config.logLevel === "debug" ? "debug" : "warn" });
  const db = createDb({ url: config.databaseUrl, maxConnections: 4 });
  const deps = createPipelineDeps(config, {
    db,
    sandbox: createSandboxProvider(config, logger),
    logger,
  });
  if (deps === null) {
    void closeDb(db);
    return null;
  }
  return { deps, close: () => closeDb(db) };
}

export const NO_PIPELINE_MESSAGE =
  "The pipeline is off: set ANTHROPIC_API_KEY (or LLM_DRIVER=fake in development) in apps/backend/.env, and leave FEATURE_PIPELINE unset or true.";

/**
 * Root scripts run commands from apps/backend and pass the caller's folder as
 * `--base`, so paths on the command line mean what the caller typed.
 */
export function resolveFromBase(base: string | undefined, path: string): string {
  return resolve(base ?? process.cwd(), path);
}

/** The id of the account with this email, or null. */
export async function userIdByEmail(
  deps: PipelineDeps,
  email: string,
): Promise<string | null> {
  const [row] = await deps.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email.toLowerCase()));
  return row?.id ?? null;
}

const SETTLED = new Set([
  "awaiting_plan_review",
  "ready_for_review",
  "published",
  "failed",
  "cancelled",
]);

/**
 * Runs the pipeline in this process until the ingestion stops for a person
 * (plan review, review) or ends, calling `onChange` as its state changes.
 * Ticks run every task in the queue, not just this ingestion's.
 */
export async function runUntilSettled(
  deps: PipelineDeps,
  ingestionId: string,
  onChange: (state: IngestionState) => void,
): Promise<IngestionState> {
  let last = "";
  for (;;) {
    const state = await getIngestionState(deps.db, ingestionId);
    if (!state) throw new Error(`ingestion ${ingestionId} disappeared`);
    const fingerprint = JSON.stringify([
      state.ingestion.status,
      state.steps.map((step) => [step.status, step.attempts]),
    ]);
    if (fingerprint !== last) {
      last = fingerprint;
      onChange(state);
    }
    if (SETTLED.has(state.ingestion.status)) return state;
    const result = await tick(deps, {
      handlers: PIPELINE_HANDLERS,
      budgetMs: PROCESS_TICK_BUDGET_MS,
      concurrency: TICK_CONCURRENCY,
    });
    if (result.ran === 0) await Bun.sleep(1_000);
  }
}
