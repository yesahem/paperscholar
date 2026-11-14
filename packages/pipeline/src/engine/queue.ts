import { schema, sql, type Database, type Transaction } from "@repo/db";
import type { TaskKind } from "@repo/shared";
import type { LlmUsage } from "../llm/types";

type Executor = Database | Transaction;

/**
 * Queues a task unless one like it is still pending or running
 * (`pipeline_tasks_one_open`), so a completion that is replayed enqueues nothing twice.
 */
export async function enqueue(
  tx: Executor,
  ingestionId: string,
  kind: TaskKind,
  key = "",
  runAfter?: Date,
): Promise<void> {
  await tx
    .insert(schema.pipelineTasks)
    .values({
      id: Bun.randomUUIDv7(),
      ingestionId,
      kind,
      key,
      ...(runAfter ? { runAfter } : {}),
    })
    .onConflictDoNothing();
}

/** Adds to an ingestion's token and sandbox-run totals, atomically. */
export async function addIngestionUsage(
  tx: Executor,
  ingestionId: string,
  usage: Partial<LlmUsage> & { sandboxRuns?: number },
): Promise<void> {
  const add = (field: string, value: number | undefined) =>
    sql`${field}::text, coalesce((usage->>${field})::bigint, 0) + ${value ?? 0}`;
  await tx.execute(sql`
    update ingestions set usage = usage || jsonb_build_object(
      ${add("calls", usage.calls)},
      ${add("inputTokens", usage.inputTokens)},
      ${add("outputTokens", usage.outputTokens)},
      ${add("cacheReadTokens", usage.cacheReadTokens)},
      ${add("cacheWriteTokens", usage.cacheWriteTokens)},
      ${add("sandboxRuns", usage.sandboxRuns)}
    ), updated_at = now()
    where id = ${ingestionId}
  `);
}
