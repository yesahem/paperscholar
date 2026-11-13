import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Public profile fields that Better Auth does not own. One row per user,
 * created by the after-create hook; readers treat a missing row as empty
 * (docs/specs/04-database.md §4, §5.2).
 */
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    bio: text("bio"),
    avatarKey: text("avatar_key"),
    /** When the username last changed; it may change once per 30 days. */
    usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("profiles_bio_length_check", sql`char_length(${table.bio}) <= 280`)],
);
