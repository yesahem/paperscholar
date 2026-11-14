import {
  INGESTION_SOURCE_TYPES,
  INGESTION_STATUSES,
  PIPELINE_STAGES,
  STEP_STATUSES,
  TASK_KINDS,
  TASK_STATUSES,
} from "@repo/shared/pipeline";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const quoted = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

/**
 * One run of the paper pipeline (docs/specs/09-paper-pipeline.md §15). Holds
 * state and bookkeeping only: everything generated is an object in storage
 * under `ingestions/<id>/`.
 */
export const ingestions = pgTable(
  "ingestions",
  {
    id: uuid("id").primaryKey(),
    status: text("status", { enum: INGESTION_STATUSES }).notNull().default("queued"),
    sourceType: text("source_type", { enum: INGESTION_SOURCE_TYPES }).notNull(),
    /** The arXiv id, when the paper came from arXiv. */
    sourceRef: text("source_ref"),
    pdfSha256: text("pdf_sha256").notNull(),
    /** Intake options (§4), validated by the pipeline's schema. */
    options: jsonb("options").notNull().default({}),
    /** The paper's title once stage 1 has read it, for lists. */
    title: text("title"),
    /** Set at assemble. */
    paperId: text("paper_id"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    /** Tokens and sandbox runs spent, accumulated by every task. */
    usage: jsonb("usage").notNull().default({}),
    /** The PDF's id in the model provider's file store, once uploaded. */
    llmFileId: text("llm_file_id"),
    /** Where a failed ingestion stopped and resumes from. */
    failedStage: text("failed_stage", { enum: PIPELINE_STAGES }),
    error: text("error"),
    /** Null once the uploader's account is deleted; the draft stays. */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "ingestions_status_check",
      sql`${table.status} in (${quoted(INGESTION_STATUSES)})`,
    ),
    check(
      "ingestions_source_type_check",
      sql`${table.sourceType} in (${quoted(INGESTION_SOURCE_TYPES)})`,
    ),
    // One live draft per PDF. A published paper may be ingested again with `force`.
    uniqueIndex("ingestions_one_per_pdf")
      .on(table.pdfSha256)
      .where(sql`${table.status} not in ('failed', 'cancelled', 'published')`),
    index("ingestions_by_source_ref").on(table.sourceRef),
    index("ingestions_by_creator").on(table.createdBy, table.createdAt),
  ],
);

/** One learning step of an ingestion, as planned and then written and verified. */
export const ingestionSteps = pgTable(
  "ingestion_steps",
  {
    ingestionId: uuid("ingestion_id")
      .notNull()
      .references(() => ingestions.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: STEP_STATUSES }).notNull().default("pending"),
    /** Write attempts used so far (at most 3 before `needs_attention`). */
    attempts: integer("attempts").notNull().default(0),
    /** Pass or fail and a one-line reason per check, for the latest content. */
    verification: jsonb("verification"),
    /** `{ check, reason, by, at }` for each waived check. */
    waivers: jsonb("waivers").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ingestionId, table.stepId] }),
    check(
      "ingestion_steps_status_check",
      sql`${table.status} in (${quoted(STEP_STATUSES)})`,
    ),
  ],
);

/**
 * The queue of small restartable tasks that drives every ingestion (§13).
 * Claimed with `for update skip locked` under a lease; a task whose lease has
 * expired is simply run again.
 */
export const pipelineTasks = pgTable(
  "pipeline_tasks",
  {
    id: uuid("id").primaryKey(),
    ingestionId: uuid("ingestion_id")
      .notNull()
      .references(() => ingestions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: TASK_KINDS }).notNull(),
    /** The step id for `write` and `verify`; empty otherwise. */
    key: text("key").notNull().default(""),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("pending"),
    /** Times claimed, including reruns after a lapsed lease. */
    attempts: integer("attempts").notNull().default(0),
    /** Times the task threw; it is retried with backoff up to the limit (§13). */
    failures: integer("failures").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    /** Identifies the current claim, so a worker whose lease lapsed cannot finish it. */
    leaseToken: uuid("lease_token"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("pipeline_tasks_kind_check", sql`${table.kind} in (${quoted(TASK_KINDS)})`),
    check(
      "pipeline_tasks_status_check",
      sql`${table.status} in (${quoted(TASK_STATUSES)})`,
    ),
    index("pipeline_tasks_runnable")
      .on(table.runAfter)
      .where(sql`${table.status} in ('pending', 'running')`),
    // A task is never queued twice while one like it is still to run.
    uniqueIndex("pipeline_tasks_one_open")
      .on(table.ingestionId, table.kind, table.key)
      .where(sql`${table.status} in ('pending', 'running')`),
  ],
);
