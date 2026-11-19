import type {
  CreateFeedback,
  FeedbackItem,
  FeedbackList,
  PublicReviewList,
  UpdateFeedback,
} from "@repo/shared";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from "@repo/shared/feedback";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { apiRequest, type CallOptions } from "@repo/web-core/api/client";

/**
 * Reviews and bug reports (docs/specs/10-secondary-features.md §4). Each
 * schema mirrors the one in @repo/shared; the type annotation keeps them in step.
 */

export const feedbackItemSchema: z.ZodMiniType<FeedbackItem> = z.object({
  id: z.string(),
  type: z.enum(FEEDBACK_TYPES),
  rating: z.nullable(z.number()),
  body: z.string(),
  status: z.enum(FEEDBACK_STATUSES),
  paperId: z.nullable(z.string()),
  problemId: z.nullable(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const feedbackListSchema: z.ZodMiniType<FeedbackList> = z.object({
  items: z.array(feedbackItemSchema),
  nextCursor: z.nullable(z.string()),
});

export const publicReviewListSchema: z.ZodMiniType<PublicReviewList> = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      rating: z.nullable(z.number()),
      body: z.string(),
      author: z.object({ username: z.string(), avatarUrl: z.nullable(z.string()) }),
      createdAt: z.string(),
    }),
  ),
  nextCursor: z.nullable(z.string()),
});

function withCursor(query: Record<string, string>, cursor: string | null): string {
  return new URLSearchParams(cursor ? { ...query, cursor } : query).toString();
}

export function getReviews(
  cursor: string | null,
  options: CallOptions = {},
): Promise<PublicReviewList> {
  return apiRequest(
    `/v1/feedback?${withCursor({ type: "review" }, cursor)}`,
    publicReviewListSchema,
    options,
  );
}

export function getMyFeedback(
  cursor: string | null,
  options: CallOptions = {},
): Promise<FeedbackList> {
  return apiRequest(
    `/v1/feedback?${withCursor({ mine: "1" }, cursor)}`,
    feedbackListSchema,
    options,
  );
}

export function createFeedback(
  body: CreateFeedback,
  options: CallOptions = {},
): Promise<FeedbackItem> {
  return apiRequest("/v1/feedback", feedbackItemSchema, {
    ...options,
    method: "POST",
    body,
  });
}

export function updateFeedback(
  id: string,
  body: UpdateFeedback,
  options: CallOptions = {},
): Promise<FeedbackItem> {
  return apiRequest(`/v1/feedback/${encodeURIComponent(id)}`, feedbackItemSchema, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteFeedback(id: string, options: CallOptions = {}): Promise<void> {
  return apiRequest(`/v1/feedback/${encodeURIComponent(id)}`, null, {
    ...options,
    method: "DELETE",
  });
}
