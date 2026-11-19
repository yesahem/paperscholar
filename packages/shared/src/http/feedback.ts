import { z } from "zod";
import { slugSchema } from "../content";
import {
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_PAGE_SIZE,
  FEEDBACK_RATING,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
} from "../feedback";

/**
 * Contracts of the feedback endpoints (docs/specs/10-secondary-features.md §4)
 * and of the maintainers' inbox in the CMS (docs/specs/14-cms.md §6).
 */

const isoTimestamp = z.iso.datetime({ offset: true });

const bodySchema = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .max(
    FEEDBACK_BODY_MAX_LENGTH,
    `must be at most ${FEEDBACK_BODY_MAX_LENGTH} characters`,
  );

const ratingSchema = z
  .number({ error: "must be a number" })
  .int("must be a whole number")
  .min(FEEDBACK_RATING.min, `must be at least ${FEEDBACK_RATING.min}`)
  .max(FEEDBACK_RATING.max, `must be at most ${FEEDBACK_RATING.max}`);

const pageLimit = z.coerce
  .number({ error: "must be a number" })
  .int("must be a whole number")
  .min(1, "must be at least 1")
  .max(100, "must be at most 100")
  .default(FEEDBACK_PAGE_SIZE);
const cursor = z.string().min(1).max(200).optional();

export const feedbackTypeSchema = z.enum(FEEDBACK_TYPES);
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);

/**
 * `POST /v1/feedback`. A bug report may name the step it is about: both
 * `paperId` and `problemId`, or neither.
 */
export const createFeedbackSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("review"),
    rating: ratingSchema.optional(),
    body: bodySchema,
  }),
  z
    .strictObject({
      type: z.literal("bug"),
      body: bodySchema,
      paperId: slugSchema.optional(),
      problemId: slugSchema.optional(),
    })
    .refine(
      (report) => (report.paperId === undefined) === (report.problemId === undefined),
      {
        path: ["problemId"],
        message: "name both the paper and the problem, or neither",
      },
    ),
]);
export type CreateFeedback = z.infer<typeof createFeedbackSchema>;

/**
 * `PATCH /v1/feedback/:id`, by the author or an admin. A rating can be set
 * or cleared on reviews only. Status changes go through the CMS inbox.
 */
export const updateFeedbackSchema = z
  .strictObject({
    body: bodySchema.optional(),
    rating: ratingSchema.nullable().optional(),
  })
  .refine((update) => update.body !== undefined || update.rating !== undefined, {
    message: "change the body or the rating",
  });
export type UpdateFeedback = z.infer<typeof updateFeedbackSchema>;

export const feedbackParamsSchema = z.strictObject({
  id: z.uuid("must be a feedback id"),
});

/**
 * `GET /v1/feedback`: `type=review` lists approved reviews to anyone;
 * `mine=1` lists the caller's own items, optionally of one type.
 */
export const listFeedbackQuerySchema = z
  .strictObject({
    type: feedbackTypeSchema.optional(),
    mine: z.literal("1", { error: 'must be "1"' }).optional(),
    limit: pageLimit,
    cursor,
  })
  .refine((query) => query.mine !== undefined || query.type === "review", {
    path: ["type"],
    message: "only reviews are public: pass type=review, or mine=1 for your own items",
  });
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

/** One of the caller's own items. */
export const feedbackItemSchema = z.object({
  id: z.uuid(),
  type: feedbackTypeSchema,
  rating: z.number().int().nullable(),
  body: z.string(),
  status: feedbackStatusSchema,
  paperId: z.string().nullable(),
  problemId: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});
export type FeedbackItem = z.infer<typeof feedbackItemSchema>;

export const feedbackListSchema = z.object({
  items: z.array(feedbackItemSchema),
  nextCursor: z.string().nullable(),
});
export type FeedbackList = z.infer<typeof feedbackListSchema>;

/** An approved review as anyone sees it: the author's public name only. */
export const publicReviewSchema = z.object({
  id: z.uuid(),
  rating: z.number().int().nullable(),
  body: z.string(),
  author: z.object({ username: z.string(), avatarUrl: z.string().nullable() }),
  createdAt: isoTimestamp,
});
export type PublicReview = z.infer<typeof publicReviewSchema>;

export const publicReviewListSchema = z.object({
  items: z.array(publicReviewSchema),
  nextCursor: z.string().nullable(),
});
export type PublicReviewList = z.infer<typeof publicReviewListSchema>;

// ── The CMS inbox (/v1/admin/feedback) ─────────────────────────────────────────

/** `GET /v1/admin/feedback`: newest first, optionally of one type or status. */
export const adminFeedbackQuerySchema = z.strictObject({
  type: feedbackTypeSchema.optional(),
  status: feedbackStatusSchema.optional(),
  limit: pageLimit,
  cursor,
});
export type AdminFeedbackQuery = z.infer<typeof adminFeedbackQuerySchema>;

export const adminFeedbackItemSchema = feedbackItemSchema.extend({
  /** Null when the account has no username yet. */
  author: z.object({ username: z.string().nullable() }),
  /** The ingestion whose review screen shows the reported step, when there is one. */
  ingestionId: z.uuid().nullable(),
});
export type AdminFeedbackItem = z.infer<typeof adminFeedbackItemSchema>;

export const adminFeedbackListSchema = z.object({
  items: z.array(adminFeedbackItemSchema),
  nextCursor: z.string().nullable(),
});
export type AdminFeedbackList = z.infer<typeof adminFeedbackListSchema>;

/**
 * `PATCH /v1/admin/feedback/:id`. Maintainers resolve and reopen bug reports;
 * approving or rejecting a review needs an admin.
 */
export const setFeedbackStatusSchema = z.strictObject({
  status: feedbackStatusSchema,
});
export type SetFeedbackStatus = z.infer<typeof setFeedbackStatusSchema>;
