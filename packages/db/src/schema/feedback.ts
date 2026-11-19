import {
  BUG_STATUSES,
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_RATING,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  REVIEW_STATUSES,
} from "@repo/shared/feedback";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const quoted = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

/**
 * Reviews and bug reports (docs/specs/10-secondary-features.md §4). A bug
 * report filed from a step names its paper and problem. Rows go with the
 * account that wrote them.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: FEEDBACK_TYPES }).notNull(),
    rating: smallint("rating"),
    body: text("body").notNull(),
    status: text("status", { enum: FEEDBACK_STATUSES }).notNull(),
    paperId: text("paper_id"),
    problemId: text("problem_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("feedback_type_check", sql`${table.type} in (${quoted(FEEDBACK_TYPES)})`),
    check(
      "feedback_status_check",
      sql`(${table.type} = 'review' and ${table.status} in (${quoted(REVIEW_STATUSES)})) or (${table.type} = 'bug' and ${table.status} in (${quoted(BUG_STATUSES)}))`,
    ),
    check(
      "feedback_rating_check",
      sql`${table.rating} is null or (${table.type} = 'review' and ${table.rating} between ${sql.raw(String(FEEDBACK_RATING.min))} and ${sql.raw(String(FEEDBACK_RATING.max))})`,
    ),
    check(
      "feedback_body_check",
      sql`char_length(${table.body}) between 1 and ${sql.raw(String(FEEDBACK_BODY_MAX_LENGTH))}`,
    ),
    check(
      "feedback_step_check",
      sql`(${table.paperId} is null) = (${table.problemId} is null) and (${table.paperId} is null or ${table.type} = 'bug')`,
    ),
    index("feedback_by_status").on(
      table.type,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("feedback_user_recent").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);
