import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Fixed-window rate-limit counters, shared by every serverless instance.
 * Spec: docs/specs/04-database.md §4, docs/specs/11-security-ops.md §3.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    // Retention deletes old windows (docs/specs/04-database.md §8).
    index("rate_limit_counters_window_start_idx").on(table.windowStart),
  ],
);
