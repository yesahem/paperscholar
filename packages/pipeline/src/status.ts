import { asc, eq, schema, sql, type Database } from "@repo/db";
import type { TaskKind, TaskStatus } from "@repo/shared";
import { ingestionUsageSchema, type IngestionUsage } from "./schemas";

export type IngestionRecord = typeof schema.ingestions.$inferSelect;
export type IngestionStepRecord = typeof schema.ingestionSteps.$inferSelect;

export interface IngestionState {
  ingestion: IngestionRecord;
  usage: IngestionUsage;
  steps: IngestionStepRecord[];
  tasks: {
    kind: TaskKind;
    key: string;
    status: TaskStatus;
    attempts: number;
    error: string | null;
  }[];
}

/** An ingestion with its steps and task queue, for progress views and `paper:status`. */
export async function getIngestionState(
  db: Database,
  id: string,
): Promise<IngestionState | null> {
  const [ingestion] = await db
    .select()
    .from(schema.ingestions)
    .where(eq(schema.ingestions.id, id));
  if (!ingestion) return null;
  const [steps, tasks] = await Promise.all([
    db
      .select()
      .from(schema.ingestionSteps)
      .where(eq(schema.ingestionSteps.ingestionId, id))
      .orderBy(asc(schema.ingestionSteps.position)),
    db
      .select({
        kind: schema.pipelineTasks.kind,
        key: schema.pipelineTasks.key,
        status: schema.pipelineTasks.status,
        attempts: schema.pipelineTasks.attempts,
        error: schema.pipelineTasks.error,
      })
      .from(schema.pipelineTasks)
      .where(eq(schema.pipelineTasks.ingestionId, id))
      .orderBy(asc(schema.pipelineTasks.createdAt)),
  ]);
  return { ingestion, usage: ingestionUsageSchema.parse(ingestion.usage), steps, tasks };
}

/** Whether `id` names an ingestion; tolerant of strings that are not UUIDs. */
export async function ingestionExists(db: Database, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const rows = await db.execute<{ found: boolean }>(
    sql`select exists(select 1 from ingestions where id = ${id}) as found`,
  );
  return rows[0]?.found ?? false;
}
