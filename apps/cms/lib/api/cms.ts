import {
  adminTracksSchema,
  dashboardSchema,
  evalRunSchema,
  latestEvalSchema,
  type AdminTracks,
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
