/**
 * Feedback rules (docs/specs/10-secondary-features.md §4) as plain constants,
 * with no schema library, so browser code can import them as
 * `@repo/shared/feedback`. The request and response schemas are in
 * http/feedback.ts.
 */

/** A `review` is public once an admin approves it; a `bug` report never is. */
export const FEEDBACK_TYPES = ["review", "bug"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/** A review waits for an admin, who approves or rejects it. */
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** A bug report is open until a maintainer resolves it. */
export const BUG_STATUSES = ["open", "resolved"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];

export const FEEDBACK_STATUSES = [...REVIEW_STATUSES, ...BUG_STATUSES] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** The status a new item starts in. */
export const INITIAL_FEEDBACK_STATUS = {
  review: "pending",
  bug: "open",
} as const satisfies Record<FeedbackType, FeedbackStatus>;

/** Whether `status` belongs to items of `type`. */
export function isStatusOf(type: FeedbackType, status: FeedbackStatus): boolean {
  const allowed: readonly FeedbackStatus[] =
    type === "review" ? REVIEW_STATUSES : BUG_STATUSES;
  return allowed.includes(status);
}

export const FEEDBACK_BODY_MAX_LENGTH = 2000;
export const FEEDBACK_RATING = { min: 1, max: 5 } as const;

/** Items per page of a feedback list. */
export const FEEDBACK_PAGE_SIZE = 20;
