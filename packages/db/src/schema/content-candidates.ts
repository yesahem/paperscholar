import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const CONTENT_CANDIDATE_STATUSES = [
  "pending",
  "verifying",
  "passed",
  "failed",
  "applied",
] as const;

/**
 * An edit to a paper awaiting verification. The edited files live in object
 * storage at content/papers/<paperId>/candidates/<id>.json; this row holds
 * only the state (docs/specs/04-database.md §4a).
 */
export const contentCandidates = pgTable(
  "content_candidates",
  {
    id: uuid("id").primaryKey(),
    paperId: text("paper_id").notNull(),
    status: text("status", { enum: CONTENT_CANDIDATE_STATUSES })
      .notNull()
      .default("pending"),
    verification: jsonb("verification"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "content_candidates_status_check",
      sql`${table.status} in ('pending', 'verifying', 'passed', 'failed', 'applied')`,
    ),
    index("content_candidates_paper_idx").on(table.paperId, table.createdAt),
  ],
);
