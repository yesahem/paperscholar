import type { ContentStore } from "@repo/content";
import {
  and,
  desc,
  eq,
  inArray,
  lt,
  or,
  schema,
  sql,
  type Database,
  type SQL,
} from "@repo/db";
import {
  INITIAL_FEEDBACK_STATUS,
  hasRole,
  isStatusOf,
  type AdminFeedbackItem,
  type AdminFeedbackList,
  type AdminFeedbackQuery,
  type CreateFeedback,
  type FeedbackItem,
  type FeedbackList,
  type FeedbackStatus,
  type ListFeedbackQuery,
  type PublicReviewList,
  type Role,
  type UpdateFeedback,
} from "@repo/shared";
import type { Logger } from "@repo/shared/logger";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { AppError } from "../lib/errors";
import type { RateLimiter } from "./rate-limiter";
import { utcDay } from "./submissions";

type FeedbackRow = typeof schema.feedback.$inferSelect;

const DAY_SECONDS = 86_400;

/** Who is acting, with their role read fresh from the database. */
export interface Actor {
  id: string;
  role: Role;
}

export interface FeedbackDependencies {
  db: Database;
  content: ContentStore;
  limiter: RateLimiter;
  /** Items each user may file per UTC day. */
  perDay: number;
  avatarUrl: (key: string) => string;
  logger: Logger;
  now?: () => Date;
}

export interface Feedback {
  create(userId: string, input: CreateFeedback): Promise<FeedbackItem>;
  /** Approved reviews, for anyone. */
  listReviews(query: ListFeedbackQuery): Promise<PublicReviewList>;
  /** The caller's own items, bug reports included. */
  listMine(userId: string, query: ListFeedbackQuery): Promise<FeedbackList>;
  /** The author or an admin edits the text or the rating. */
  update(actor: Actor, id: string, input: UpdateFeedback): Promise<FeedbackItem>;
  /** The author or an admin deletes the item. */
  remove(actor: Actor, id: string): Promise<void>;
  /** The CMS inbox. */
  listForMaintainers(query: AdminFeedbackQuery): Promise<AdminFeedbackList>;
  /** Maintainers resolve bug reports; only admins approve or reject reviews. */
  setStatus(actor: Actor, id: string, status: FeedbackStatus): Promise<AdminFeedbackItem>;
}

export function toFeedbackItem(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    type: row.type,
    rating: row.rating,
    body: row.body,
    status: row.status,
    paperId: row.paperId,
    problemId: row.problemId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Rows strictly older than the cursor, newest first. */
function olderThan(cursor: string | undefined): SQL | undefined {
  if (cursor === undefined) return undefined;
  const after = decodeCursor(cursor);
  const table = schema.feedback;
  return or(
    lt(table.createdAt, after.at),
    and(eq(table.createdAt, after.at), lt(table.id, after.id)),
  );
}

function page<Row extends { id: string; createdAt: Date }>(rows: Row[], limit: number) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

/**
 * Reviews and bug reports (docs/specs/10-secondary-features.md §4). Bodies
 * are plain text, stored and shown as text, and never logged.
 */
export function createFeedback({
  db,
  content,
  limiter,
  perDay,
  avatarUrl,
  logger,
  now = () => new Date(),
}: FeedbackDependencies): Feedback {
  const table = schema.feedback;

  /** The row, if `actor` may change it; otherwise `not_found`, so ids cannot be probed. */
  async function editableRow(actor: Actor, id: string): Promise<FeedbackRow> {
    const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!row || (row.userId !== actor.id && !hasRole(actor.role, "admin"))) {
      throw new AppError("not_found");
    }
    return row;
  }

  /** The latest ingestion behind each paper, for links to its review screen. */
  async function ingestionsOf(paperIds: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    if (paperIds.length === 0) return found;
    const rows = await db
      .select({ id: schema.ingestions.id, paperId: schema.ingestions.paperId })
      .from(schema.ingestions)
      .where(
        and(
          inArray(schema.ingestions.paperId, paperIds),
          inArray(schema.ingestions.status, ["ready_for_review", "published"]),
        ),
      )
      .orderBy(desc(schema.ingestions.updatedAt));
    for (const row of rows) {
      if (row.paperId && !found.has(row.paperId)) found.set(row.paperId, row.id);
    }
    return found;
  }

  async function adminItems(rows: FeedbackRow[]): Promise<AdminFeedbackItem[]> {
    const authorIds = [...new Set(rows.map((row) => row.userId))];
    const authors = new Map<string, string | null>();
    if (authorIds.length > 0) {
      const users = await db
        .select({ id: schema.user.id, username: schema.user.username })
        .from(schema.user)
        .where(inArray(schema.user.id, authorIds));
      for (const user of users) authors.set(user.id, user.username);
    }
    const ingestions = await ingestionsOf([
      ...new Set(rows.flatMap((row) => (row.paperId ? [row.paperId] : []))),
    ]);
    return rows.map((row) => ({
      ...toFeedbackItem(row),
      author: { username: authors.get(row.userId) ?? null },
      ingestionId: row.paperId ? (ingestions.get(row.paperId) ?? null) : null,
    }));
  }

  return {
    async create(userId, input) {
      if (input.type === "bug" && input.paperId !== undefined) {
        const entry = await content.getEntry(input.paperId);
        const known = entry?.status === "published";
        if (!known || !entry.problems.some((problem) => problem.id === input.problemId)) {
          throw new AppError("validation_error", {
            details: {
              issues: [
                {
                  path: known ? "problemId" : "paperId",
                  message: known
                    ? "is not a step of that paper"
                    : "is not a published paper on this site",
                },
              ],
            },
          });
        }
      }

      const day = utcDay(now());
      const quota = await limiter.consume(`feedback:user:${userId}`, {
        windowSeconds: DAY_SECONDS,
        max: perDay,
      });
      if (!quota.allowed) {
        throw new AppError("quota_exceeded", {
          message: `You have sent today's ${perDay} messages. You can send more after midnight UTC.`,
          details: { resetsAt: day.end.toISOString() },
          retryAfterSeconds: quota.retryAfterSeconds ?? DAY_SECONDS,
        });
      }

      const at = now();
      const [row] = await db
        .insert(table)
        .values({
          id: Bun.randomUUIDv7(),
          userId,
          type: input.type,
          rating: input.type === "review" ? (input.rating ?? null) : null,
          body: input.body,
          status: INITIAL_FEEDBACK_STATUS[input.type],
          paperId: input.type === "bug" ? (input.paperId ?? null) : null,
          problemId: input.type === "bug" ? (input.problemId ?? null) : null,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      if (!row) throw new Error("The feedback was not recorded");
      logger.info("feedback filed", {
        feedbackId: row.id,
        userId,
        type: row.type,
        paperId: row.paperId,
        problemId: row.problemId,
      });
      return toFeedbackItem(row);
    },

    async listReviews({ limit, cursor }) {
      const rows = await db
        .select({
          id: table.id,
          rating: table.rating,
          body: table.body,
          createdAt: table.createdAt,
          username: schema.user.username,
          avatarKey: schema.profiles.avatarKey,
        })
        .from(table)
        .innerJoin(schema.user, eq(schema.user.id, table.userId))
        .leftJoin(schema.profiles, eq(schema.profiles.userId, table.userId))
        .where(
          and(
            eq(table.type, "review"),
            eq(table.status, "approved"),
            sql`${schema.user.username} is not null`,
            olderThan(cursor),
          ),
        )
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(limit + 1);
      const { items, nextCursor } = page(rows, limit);
      return {
        items: items.map((row) => ({
          id: row.id,
          rating: row.rating,
          body: row.body,
          author: {
            username: row.username ?? "",
            avatarUrl: row.avatarKey ? avatarUrl(row.avatarKey) : null,
          },
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor,
      };
    },

    async listMine(userId, { type, limit, cursor }) {
      const rows = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.userId, userId),
            type === undefined ? undefined : eq(table.type, type),
            olderThan(cursor),
          ),
        )
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(limit + 1);
      const { items, nextCursor } = page(rows, limit);
      return { items: items.map(toFeedbackItem), nextCursor };
    },

    async update(actor, id, input) {
      const row = await editableRow(actor, id);
      if (row.type === "bug" && input.rating !== undefined && input.rating !== null) {
        throw new AppError("validation_error", {
          details: {
            issues: [{ path: "rating", message: "only reviews have a rating" }],
          },
        });
      }
      // An author's edit must be approved again; an admin's correction keeps the status.
      const reapprove =
        row.type === "review" && row.userId === actor.id && !hasRole(actor.role, "admin");
      const [updated] = await db
        .update(table)
        .set({
          ...(input.body === undefined ? {} : { body: input.body }),
          ...(input.rating === undefined ? {} : { rating: input.rating }),
          ...(reapprove ? { status: "pending" as const } : {}),
          updatedAt: now(),
        })
        .where(eq(table.id, id))
        .returning();
      if (!updated) throw new AppError("not_found");
      return toFeedbackItem(updated);
    },

    async remove(actor, id) {
      await editableRow(actor, id);
      await db.delete(table).where(eq(table.id, id));
      logger.info("feedback deleted", { feedbackId: id, by: actor.id });
    },

    async listForMaintainers({ type, status, limit, cursor }) {
      const rows = await db
        .select()
        .from(table)
        .where(
          and(
            type === undefined ? undefined : eq(table.type, type),
            status === undefined ? undefined : eq(table.status, status),
            olderThan(cursor),
          ),
        )
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(limit + 1);
      const { items, nextCursor } = page(rows, limit);
      return { items: await adminItems(items), nextCursor };
    },

    async setStatus(actor, id, status) {
      const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
      if (!row) throw new AppError("not_found");
      if (!isStatusOf(row.type, status)) {
        throw new AppError("validation_error", {
          details: {
            issues: [
              {
                path: "status",
                message:
                  row.type === "review"
                    ? "a review is pending, approved or rejected"
                    : "a bug report is open or resolved",
              },
            ],
          },
        });
      }
      if (row.type === "review" && !hasRole(actor.role, "admin")) {
        throw new AppError("forbidden", {
          message: "Only an admin can approve or reject reviews.",
        });
      }
      const [updated] = await db
        .update(table)
        .set({ status, updatedAt: now() })
        .where(eq(table.id, id))
        .returning();
      if (!updated) throw new AppError("not_found");
      logger.info("feedback status changed", { feedbackId: id, status, by: actor.id });
      const [item] = await adminItems([updated]);
      if (!item) throw new AppError("not_found");
      return item;
    },
  };
}
