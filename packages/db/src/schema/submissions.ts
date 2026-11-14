import {
  SUBMISSION_MODES,
  SUBMISSION_STATUSES,
  VERDICTS,
} from "@repo/shared/submissions";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/** What `result` holds: the run's per-test results, exactly as returned (docs/specs/07-runner.md §6). */
export interface StoredSubmissionResult {
  tests: {
    name: string;
    group: "public" | "hidden";
    status: "passed" | "failed" | "error";
    durationMs: number;
    message: string | null;
    traceback: string | null;
    stdout: string | null;
    timedOut: boolean;
  }[];
  violations: string[];
  errorOutput: string | null;
}

const quoted = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

/**
 * One run or submit of a learner's code (docs/specs/04-database.md §4). Paper
 * and problem ids are plain text: history survives a paper being archived.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull(),
    problemId: text("problem_id").notNull(),
    mode: text("mode", { enum: SUBMISSION_MODES }).notNull(),
    code: text("code").notNull(),
    status: text("status", { enum: SUBMISSION_STATUSES }).notNull().default("queued"),
    verdict: text("verdict", { enum: VERDICTS }),
    testsPassed: integer("tests_passed"),
    testsTotal: integer("tests_total"),
    result: jsonb("result").$type<StoredSubmissionResult>(),
    durationMs: integer("duration_ms"),
    /** The paper's version number at grading time. */
    contentVersion: text("content_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check("submissions_mode_check", sql`${table.mode} in (${quoted(SUBMISSION_MODES)})`),
    check(
      "submissions_status_check",
      sql`${table.status} in (${quoted(SUBMISSION_STATUSES)})`,
    ),
    check(
      "submissions_verdict_check",
      sql`${table.verdict} is null or ${table.verdict} in (${quoted(VERDICTS)})`,
    ),
    index("submissions_user_recent").on(table.userId, table.createdAt.desc()),
    index("submissions_user_problem").on(
      table.userId,
      table.paperId,
      table.problemId,
      table.createdAt.desc(),
    ),
    // One run at a time per user, enforced by the database (docs/specs/04-database.md §4).
    uniqueIndex("submissions_one_in_flight")
      .on(table.userId)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("submissions_in_flight_age")
      .on(table.createdAt)
      .where(sql`${table.status} in ('queued', 'running')`),
    // Retention deletes run-mode submissions after 30 days (docs/specs/04-database.md §8).
    index("submissions_run_mode_age")
      .on(table.createdAt)
      .where(sql`${table.mode} = 'run'`),
  ],
);
