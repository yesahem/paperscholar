import type { FeedbackStatus, FeedbackType } from "@repo/shared/feedback";

/** Wording for feedback on the /feedback page (docs/specs/10-secondary-features.md §4). */

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = {
  review: "Review",
  bug: "Bug report",
};

/** What each status means to the person who wrote the item. */
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  pending: "Waiting for approval",
  approved: "Published",
  rejected: "Not published",
  open: "Open",
  resolved: "Resolved",
};

/** "4 out of 5", or null without a rating. */
export function ratingLabel(rating: number | null, max = 5): string | null {
  return rating === null ? null : `${rating} out of ${max}`;
}

/** "Characters left" text for a body field. */
export function charactersLeft(body: string, max: number): string {
  const left = max - body.trim().length;
  return left >= 0 ? `${left} characters left` : `${-left} characters too many`;
}
