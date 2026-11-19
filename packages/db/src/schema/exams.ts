import type { Difficulty } from "@repo/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * A question as it was served, with its answer. The attempt keeps this copy,
 * so grading and history do not change when the topic's file does.
 */
export interface StoredExamQuestion {
  topicId: string;
  id: string;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
}

/**
 * One quiz attempt (docs/specs/10-secondary-features.md §1). Answers and
 * explanations stay here until the attempt is submitted; `submitted_at` is
 * set exactly once.
 */
export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The topics chosen, with their titles at the time. */
    topics: jsonb("topics").$type<{ id: string; title: string }[]>().notNull(),
    questions: jsonb("questions").$type<StoredExamQuestion[]>().notNull(),
    total: integer("total").notNull(),
    /** `answers[i]` is the option chosen for question `i`, or null. Set on submit. */
    answers: jsonb("answers").$type<(number | null)[]>(),
    score: integer("score"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "exam_attempts_graded_once_check",
      sql`(${table.submittedAt} is null) = (${table.score} is null) and (${table.submittedAt} is null) = (${table.answers} is null)`,
    ),
    check(
      "exam_attempts_score_check",
      sql`${table.score} is null or ${table.score} between 0 and ${table.total}`,
    ),
    index("exam_attempts_user_recent").on(
      table.userId,
      table.startedAt.desc(),
      table.id.desc(),
    ),
  ],
);
