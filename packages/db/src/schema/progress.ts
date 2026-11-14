import { DIFFICULTIES } from "@repo/shared/vocabulary";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { submissions } from "./submissions";

const quoted = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

/**
 * One row per problem a user has solved (docs/specs/04-database.md §4). Never
 * deleted by content changes: a solve survives the problem being retired.
 */
export const progress = pgTable(
  "progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull(),
    problemId: text("problem_id").notNull(),
    /** The problem's difficulty when it was solved; counted into `user_stats`. */
    difficulty: text("difficulty", { enum: DIFFICULTIES }).notNull(),
    firstSubmissionId: uuid("first_submission_id").references(() => submissions.id, {
      onDelete: "set null",
    }),
    solvedAt: timestamp("solved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.paperId, table.problemId] }),
    check(
      "progress_difficulty_check",
      sql`${table.difficulty} in (${quoted(DIFFICULTIES)})`,
    ),
  ],
);

/** A user solved every published problem of a paper. Never revoked. */
export const paperCompletions = pgTable(
  "paper_completions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.paperId] })],
);

/**
 * Counters derived from `progress`, `paper_completions` and `daily_activity`,
 * kept so the leaderboard is an index scan (docs/specs/04-database.md §4).
 * Created by the after-create hook; readers treat a missing row as zeros.
 */
export const userStats = pgTable(
  "user_stats",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    problemsSolved: integer("problems_solved").notNull().default(0),
    easySolved: integer("easy_solved").notNull().default(0),
    mediumSolved: integer("medium_solved").notNull().default(0),
    hardSolved: integer("hard_solved").notNull().default(0),
    papersCompleted: integer("papers_completed").notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    /** UTC day of the last passed submit. */
    lastActiveDay: date("last_active_day", { mode: "string" }),
    lastSolvedAt: timestamp("last_solved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("user_stats_by_solved").on(
      table.problemsSolved.desc(),
      table.lastSolvedAt.asc(),
      table.userId,
    ),
    index("user_stats_by_papers").on(
      table.papersCompleted.desc(),
      table.lastSolvedAt.asc(),
      table.userId,
    ),
    index("user_stats_by_recent").on(table.lastSolvedAt.desc().nullsLast(), table.userId),
  ],
);

/** Per-user, per-UTC-day counts behind the profile heatmap and streaks. */
export const dailyActivity = pgTable(
  "daily_activity",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    /** Finished submissions of either mode, except our own errors. */
    submissions: integer("submissions").notNull().default(0),
    passedSubmits: integer("passed_submits").notNull().default(0),
    newSolves: integer("new_solves").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

/** One-directional follows, with no acceptance step. */
export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followeeId] }),
    check("follows_not_self_check", sql`${table.followerId} <> ${table.followeeId}`),
    index("follows_by_followee").on(table.followeeId),
  ],
);
