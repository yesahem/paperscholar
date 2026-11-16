import { and, eq, schema, sql, type Transaction } from "@repo/db";
import type { PipelineStage, TaskKind } from "@repo/shared";
import type { PipelineDeps } from "../deps";
import { PermanentTaskError } from "../errors";
import { LlmError } from "../llm/types";

/** A task this worker holds a lease on. */
export interface ClaimedTask {
  id: string;
  ingestionId: string;
  kind: TaskKind;
  key: string;
  /** Claims so far, including this one. */
  attempts: number;
  /** Times it threw before this claim. */
  failures: number;
  leaseToken: string;
}

/**
 * The database half of a finished task: state changes and successor tasks.
 * Runs in the transaction that marks the task done (§13), after the task's
 * objects are already in storage.
 */
export type Completion = (tx: Transaction) => Promise<void>;

export interface TaskContext {
  deps: PipelineDeps;
  task: ClaimedTask;
  now: () => Date;
  signal: AbortSignal;
}

export type TaskHandler = (context: TaskContext) => Promise<Completion>;
export type TaskHandlers = Record<TaskKind, TaskHandler>;

export interface TickOptions {
  handlers: TaskHandlers;
  /** Wall-clock budget; no task is claimed after 80% of it. @default 60000 */
  budgetMs?: number;
  /** Tasks run at once by this call. @default 3 */
  concurrency?: number;
  /** Stops claiming new tasks; tasks already running finish. */
  signal?: AbortSignal;
  /** Aborts running tasks too; they are then retried. */
  taskSignal?: AbortSignal;
}

export interface TickResult {
  /** Tasks run to an outcome (done, retried or failed). */
  ran: number;
  /** Whether tasks remain that could run now or soon. */
  moreWork: boolean;
}

const STAGE_OF: Record<TaskKind, PipelineStage> = {
  read: "read",
  plan: "plan",
  write: "write",
  verify: "write",
  assemble: "assemble",
};

/** Lock taken while claiming, so concurrency limits hold across workers. */
const CLAIM_LOCK = "pipeline-claim";
const MAX_ERROR_LENGTH = 1000;

const clip = (message: string) =>
  message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}…`
    : message;

/** What a maintainer reads when a task fails; no stack traces, no payloads. */
export function describeFailure(error: unknown): string {
  if (error instanceof LlmError)
    return clip(`model call failed (${error.kind}): ${error.message}`);
  if (error instanceof Error) return clip(error.message);
  return "unknown error";
}

function isPermanent(error: unknown): boolean {
  if (error instanceof PermanentTaskError) return true;
  if (error instanceof LlmError) return !error.retryable;
  return false;
}

/** Marks an ingestion failed at `stage` and stops its other open tasks. */
export async function failIngestion(
  tx: Transaction,
  ingestionId: string,
  stage: PipelineStage,
  message: string,
  now: Date,
): Promise<void> {
  await tx
    .update(schema.ingestions)
    .set({
      status: "failed",
      failedStage: stage,
      error: clip(message),
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.ingestions.id, ingestionId));
  await tx
    .update(schema.pipelineTasks)
    .set({
      status: "failed",
      error: "stopped: the ingestion failed",
      leaseToken: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.pipelineTasks.ingestionId, ingestionId),
        sql`${schema.pipelineTasks.status} in ('pending', 'running')`,
      ),
    );
}

type CandidateRow = {
  id: string;
  ingestion_id: string;
  kind: TaskKind;
  key: string;
  attempts: number;
  failures: number;
  ingestion_status: string;
};

async function claimNext(deps: PipelineDeps, now: Date): Promise<ClaimedTask | null> {
  const { settings } = deps;
  // Raw SQL takes timestamps as ISO strings.
  const at = now.toISOString();
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CLAIM_LOCK}))`);
    for (;;) {
      const rows = await tx.execute<CandidateRow>(sql`
        select t.id, t.ingestion_id, t.kind, t.key, t.attempts, t.failures, i.status as ingestion_status
        from pipeline_tasks t
        join ingestions i on i.id = t.ingestion_id
        where t.run_after <= ${at}::timestamptz
          and (t.status = 'pending' or (t.status = 'running' and t.lease_until < ${at}::timestamptz))
          and i.status not in ('failed', 'cancelled', 'awaiting_plan_review')
          and (
            select count(*) from pipeline_tasks r
            where r.ingestion_id = t.ingestion_id and r.status = 'running'
              and r.lease_until >= ${at}::timestamptz
          ) < ${settings.tasksPerIngestion}
          and (
            i.status <> 'queued' or (
              select count(*) from ingestions a
              where a.status in ('reading', 'planning', 'writing')
            ) < ${settings.concurrentIngestions}
          )
        order by t.run_after, t.created_at
        limit 1
        for update of t skip locked
      `);
      // Transactions type raw rows loosely; the select list above fixes their shape.
      const row = rows[0] as CandidateRow | undefined;
      if (!row) return null;

      if (row.attempts >= settings.maxTaskClaims) {
        // Claimed and lost this many times: the task brings its worker down.
        await failIngestion(
          tx,
          row.ingestion_id,
          STAGE_OF[row.kind],
          `${row.kind} task never finished: its worker stopped ${row.attempts} times`,
          now,
        );
        continue;
      }

      const leaseToken = crypto.randomUUID();
      await tx
        .update(schema.pipelineTasks)
        .set({
          status: "running",
          attempts: row.attempts + 1,
          leaseUntil: new Date(now.getTime() + settings.leaseMs),
          leaseToken,
          updatedAt: now,
        })
        .where(eq(schema.pipelineTasks.id, row.id));
      if (row.kind === "read" && row.ingestion_status === "queued") {
        await tx
          .update(schema.ingestions)
          .set({ status: "reading", updatedAt: now })
          .where(eq(schema.ingestions.id, row.ingestion_id));
      }
      return {
        id: row.id,
        ingestionId: row.ingestion_id,
        kind: row.kind,
        key: row.key,
        attempts: row.attempts + 1,
        failures: row.failures,
        leaseToken,
      };
    }
  });
}

/**
 * Locks the ingestion and checks this worker still holds the task. Every
 * completion and failure starts here, so completions of one ingestion are
 * serialised and a worker whose lease lapsed changes nothing.
 */
async function holdsTask(
  tx: Transaction,
  task: ClaimedTask,
): Promise<{ held: boolean; ingestionStatus: string | null }> {
  const [ingestion] = await tx
    .select({ status: schema.ingestions.status })
    .from(schema.ingestions)
    .where(eq(schema.ingestions.id, task.ingestionId))
    .for("update");
  const [row] = await tx
    .select({
      status: schema.pipelineTasks.status,
      leaseToken: schema.pipelineTasks.leaseToken,
    })
    .from(schema.pipelineTasks)
    .where(eq(schema.pipelineTasks.id, task.id))
    .for("update");
  return {
    held: row?.status === "running" && row.leaseToken === task.leaseToken,
    ingestionStatus: ingestion?.status ?? null,
  };
}

async function complete(
  deps: PipelineDeps,
  task: ClaimedTask,
  completion: Completion,
  now: Date,
) {
  await deps.db.transaction(async (tx) => {
    const { held, ingestionStatus } = await holdsTask(tx, task);
    if (!held) {
      deps.logger.warn(
        "pipeline task finished after losing its lease; result discarded",
        {
          taskId: task.id,
          kind: task.kind,
        },
      );
      return;
    }
    const stopped =
      ingestionStatus === null ||
      ingestionStatus === "failed" ||
      ingestionStatus === "cancelled";
    if (!stopped) await completion(tx);
    await tx
      .update(schema.pipelineTasks)
      .set({
        status: "done",
        leaseToken: null,
        leaseUntil: null,
        error: stopped ? "skipped: the ingestion was stopped" : null,
        updatedAt: now,
      })
      .where(eq(schema.pipelineTasks.id, task.id));
  });
}

async function fail(deps: PipelineDeps, task: ClaimedTask, error: unknown, now: Date) {
  const message = describeFailure(error);
  const failures = task.failures + 1;
  const permanent = isPermanent(error) || failures >= deps.settings.maxTaskFailures;
  await deps.db.transaction(async (tx) => {
    const { held } = await holdsTask(tx, task);
    if (!held) return;
    if (permanent) {
      await tx
        .update(schema.pipelineTasks)
        .set({ failures, updatedAt: now })
        .where(eq(schema.pipelineTasks.id, task.id));
      await failIngestion(tx, task.ingestionId, STAGE_OF[task.kind], message, now);
      return;
    }
    const delay = deps.settings.retryBaseMs * 2 ** (failures - 1);
    await tx
      .update(schema.pipelineTasks)
      .set({
        status: "pending",
        failures,
        runAfter: new Date(now.getTime() + delay),
        leaseToken: null,
        leaseUntil: null,
        error: message,
        updatedAt: now,
      })
      .where(eq(schema.pipelineTasks.id, task.id));
  });
  deps.logger[permanent ? "error" : "warn"](
    permanent
      ? "pipeline task failed; ingestion stopped"
      : "pipeline task failed; will retry",
    {
      taskId: task.id,
      ingestionId: task.ingestionId,
      kind: task.kind,
      attempts: task.attempts,
      failures,
      error: message,
    },
  );
}

async function runTask(
  deps: PipelineDeps,
  handlers: TaskHandlers,
  task: ClaimedTask,
  signal: AbortSignal,
): Promise<void> {
  const now = deps.now ?? (() => new Date());
  // Keep the lease while the handler works; a crashed worker stops renewing it.
  const renew = setInterval(
    () => {
      deps.db
        .update(schema.pipelineTasks)
        .set({ leaseUntil: new Date(now().getTime() + deps.settings.leaseMs) })
        .where(
          and(
            eq(schema.pipelineTasks.id, task.id),
            eq(schema.pipelineTasks.leaseToken, task.leaseToken),
          ),
        )
        .catch((error: unknown) =>
          deps.logger.warn("could not renew a task lease", { taskId: task.id, error }),
        );
    },
    Math.max(1000, Math.floor(deps.settings.leaseMs / 3)),
  );

  try {
    const completion = await handlers[task.kind]({ deps, task, now, signal });
    await complete(deps, task, completion, now());
  } catch (error) {
    await fail(deps, task, error, now());
  } finally {
    clearInterval(renew);
  }
}

/** Whether any task could run now or later. */
export async function hasOpenTasks(deps: PipelineDeps): Promise<boolean> {
  const rows = await deps.db.execute<{ open: boolean }>(sql`
    select exists(
      select 1 from pipeline_tasks t join ingestions i on i.id = t.ingestion_id
      where t.status in ('pending', 'running')
        and i.status not in ('failed', 'cancelled', 'awaiting_plan_review')
    ) as open
  `);
  return rows[0]?.open ?? false;
}

/**
 * Claims and runs pipeline tasks until none can run or 80% of the budget is
 * spent (docs/specs/09-paper-pipeline.md §13). Called by the worker loop and
 * by the internal tick endpoint; the handlers are the same in both.
 */
export async function tick(
  deps: PipelineDeps,
  options: TickOptions,
): Promise<TickResult> {
  const now = deps.now ?? (() => new Date());
  const budgetMs = options.budgetMs ?? 60_000;
  const concurrency = options.concurrency ?? 3;
  const signal = options.signal ?? new AbortController().signal;
  const taskSignal = options.taskSignal ?? new AbortController().signal;
  const started = Date.now();
  const claimUntil = started + budgetMs * 0.8;

  const running = new Set<Promise<void>>();
  let ran = 0;

  for (;;) {
    while (!signal.aborted && running.size < concurrency && Date.now() < claimUntil) {
      const task = await claimNext(deps, now());
      if (!task) break;
      const run: Promise<void> = runTask(
        deps,
        options.handlers,
        task,
        taskSignal,
      ).finally(() => {
        running.delete(run);
        ran += 1;
      });
      running.add(run);
    }
    if (running.size === 0) break;
    // A finished task may have enqueued successors; claim again after each one.
    await Promise.race(running);
  }

  return { ran, moreWork: await hasOpenTasks(deps) };
}
