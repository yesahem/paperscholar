import { COURSE_NOTE_MAX_LENGTH } from "@repo/shared/courses";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Where a learner is in each course item, kept per user so it follows them
 * across devices. Course and item ids are plain text: progress survives a
 * course being edited.
 */
export const courseProgress = pgTable(
  "course_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    itemId: text("item_id").notNull(),
    completed: boolean("completed").notNull().default(false),
    lastWatchedSeconds: integer("last_watched_seconds").notNull().default(0),
    /** Best exercise score, when the item is an exercise that was submitted. */
    score: integer("score"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.courseId, table.itemId] }),
    check("course_progress_watched_check", sql`${table.lastWatchedSeconds} >= 0`),
    check(
      "course_progress_completed_check",
      sql`${table.completed} = (${table.completedAt} is not null)`,
    ),
  ],
);

/** A learner's own notes on one course item, at most 10 000 characters. */
export const courseNotes = pgTable(
  "course_notes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    itemId: text("item_id").notNull(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.courseId, table.itemId] }),
    check(
      "course_notes_body_check",
      sql`char_length(${table.body}) <= ${sql.raw(String(COURSE_NOTE_MAX_LENGTH))}`,
    ),
  ],
);
