import {
  adminFeedbackItemSchema,
  adminFeedbackListSchema,
  adminTracksSchema,
  dashboardSchema,
  evalRunSchema,
  latestEvalSchema,
  type AdminFeedbackItem,
  type AdminFeedbackList,
  type AdminFeedbackQuery,
  type AdminTracks,
  type FeedbackStatus,
  type Dashboard,
  type EvalRun,
  type LatestEval,
  type PutTracks,
  type StartEval,
} from "@repo/shared";
import { apiRequest, type CallOptions } from "@repo/web-core/api/client";

/**
 * The CMS endpoints under /v1/admin (docs/specs/14-cms.md §9). Responses are
 * checked against the shared schemas, so the screens trust what they get.
 */

export function getDashboard(
  days: number,
  options: CallOptions = {},
): Promise<Dashboard> {
  return apiRequest(`/v1/admin/dashboard?days=${days}`, dashboardSchema, options);
}

export function getTracks(options: CallOptions = {}): Promise<AdminTracks> {
  return apiRequest("/v1/admin/tracks", adminTracksSchema, options);
}

export function putTracks(
  body: PutTracks,
  options: CallOptions = {},
): Promise<AdminTracks> {
  return apiRequest("/v1/admin/tracks", adminTracksSchema, {
    ...options,
    method: "PUT",
    body,
  });
}

export function getLatestEval(options: CallOptions = {}): Promise<LatestEval> {
  return apiRequest("/v1/admin/evals/latest", latestEvalSchema, options);
}

export function startEval(body: StartEval, options: CallOptions = {}): Promise<EvalRun> {
  return apiRequest("/v1/admin/evals", evalRunSchema, {
    ...options,
    method: "POST",
    body,
  });
}

/** The feedback inbox (docs/specs/14-cms.md §6), newest first. */
export function getFeedbackInbox(
  query: Partial<Pick<AdminFeedbackQuery, "type" | "status">> & {
    cursor?: string | null;
  },
  options: CallOptions = {},
): Promise<AdminFeedbackList> {
  const params = new URLSearchParams();
  if (query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  const search = params.size > 0 ? `?${params}` : "";
  return apiRequest(`/v1/admin/feedback${search}`, adminFeedbackListSchema, options);
}

/** Resolves or reopens a bug report; approves or rejects a review (admins). */
export function setFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  options: CallOptions = {},
): Promise<AdminFeedbackItem> {
  return apiRequest(
    `/v1/admin/feedback/${encodeURIComponent(id)}`,
    adminFeedbackItemSchema,
    {
      ...options,
      method: "PATCH",
      body: { status },
    },
  );
}

/** Deletes an item for good (admins), through the learner endpoint's admin rule. */
export function deleteFeedback(id: string, options: CallOptions = {}): Promise<void> {
  return apiRequest(`/v1/feedback/${encodeURIComponent(id)}`, null, {
    ...options,
    method: "DELETE",
  });
}
