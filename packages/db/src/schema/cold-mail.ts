import {
  COLD_MAIL_STATUSES,
  COLD_MAIL_TARGET_TYPES,
  COLD_MAIL_TONES,
} from "@repo/shared/cold-mail";
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

const quoted = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

/**
 * An uploaded CV (docs/specs/10-secondary-features.md §6). The file is an
 * object in the private bucket at `storage_key`; rows and files go with the
 * account.
 */
export const cvDocuments = pgTable(
  "cv_documents",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Null when the page count could not be read from the file. */
    pages: integer("pages"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cv_documents_user_recent").on(table.userId, table.createdAt.desc())],
);

/**
 * One generated outreach email. Shown only to its author, as text. Token
 * counts record what each generation cost the operator.
 */
export const coldMails = pgTable(
  "cold_mails",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Null once the CV is deleted; the draft stays. */
    cvId: uuid("cv_id").references(() => cvDocuments.id, { onDelete: "set null" }),
    targetType: text("target_type", { enum: COLD_MAIL_TARGET_TYPES }).notNull(),
    targetName: text("target_name").notNull(),
    targetOrganisation: text("target_organisation").notNull(),
    targetRole: text("target_role"),
    targetNotes: text("target_notes"),
    tone: text("tone", { enum: COLD_MAIL_TONES }).notNull(),
    status: text("status", { enum: COLD_MAIL_STATUSES }).notNull().default("pending"),
    subject: text("subject"),
    body: text("body"),
    highlights: jsonb("highlights").$type<string[]>(),
    /** Why the generation failed, in words for the user. */
    failure: text("failure"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "cold_mails_target_type_check",
      sql`${table.targetType} in (${quoted(COLD_MAIL_TARGET_TYPES)})`,
    ),
    check("cold_mails_tone_check", sql`${table.tone} in (${quoted(COLD_MAIL_TONES)})`),
    check(
      "cold_mails_status_check",
      sql`${table.status} in (${quoted(COLD_MAIL_STATUSES)})`,
    ),
    check(
      "cold_mails_done_check",
      sql`(${table.status} = 'done') = (${table.subject} is not null and ${table.body} is not null)`,
    ),
    index("cold_mails_user_recent").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);
