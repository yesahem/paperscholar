import type {
  CreateSubmission,
  Submission,
  SubmissionCreated,
  SubmissionList,
  SubmissionSummary,
} from "@repo/shared";
import {
  SUBMISSION_MODES,
  SUBMISSION_STATUSES,
  TEST_GROUPS,
  TEST_STATUSES,
  VERDICTS,
} from "@repo/shared/submissions";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { apiRequest, type FetchLike } from "./client";

const summaryFields = {
  id: z.string(),
  paperId: z.string(),
  problemId: z.string(),
  mode: z.enum(SUBMISSION_MODES),
  status: z.enum(SUBMISSION_STATUSES),
  verdict: z.nullable(z.enum(VERDICTS)),
  testsPassed: z.nullable(z.number()),
  testsTotal: z.nullable(z.number()),
  durationMs: z.nullable(z.number()),
  createdAt: z.string(),
  finishedAt: z.nullable(z.string()),
};

/** Mirrors `submissionSummarySchema` in @repo/shared; the annotation keeps them in step. */
export const submissionSummarySchema: z.ZodMiniType<SubmissionSummary> =
  z.object(summaryFields);

/** Mirrors `submissionSchema` in @repo/shared. */
export const submissionSchema: z.ZodMiniType<Submission> = z.object({
  ...summaryFields,
  tests: z.nullable(
    z.array(
      z.object({
        name: z.string(),
        group: z.enum(TEST_GROUPS),
        status: z.enum(TEST_STATUSES),
        durationMs: z.number(),
        message: z.nullable(z.string()),
        traceback: z.nullable(z.string()),
        stdout: z.nullable(z.string()),
      }),
    ),
  ),
  violations: z.nullable(z.array(z.string())),
  errorOutput: z.nullable(z.string()),
  code: z.string(),
});

/** Mirrors `submissionListSchema` in @repo/shared. */
export const submissionListSchema: z.ZodMiniType<SubmissionList> = z.object({
  items: z.array(submissionSummarySchema),
  nextCursor: z.nullable(z.string()),
});

/** Mirrors `submissionCreatedSchema` in @repo/shared. */
export const submissionCreatedSchema: z.ZodMiniType<SubmissionCreated> = z.object({
  id: z.string(),
  status: z.literal("queued"),
});

/** `POST /v1/submissions` (docs/specs/05-api.md §6). */
export function createSubmission(
  body: CreateSubmission,
  options: { signal?: AbortSignal; fetch?: FetchLike } = {},
): Promise<SubmissionCreated> {
  return apiRequest("/v1/submissions", submissionCreatedSchema, {
    method: "POST",
    body,
    ...options,
  });
}

/** `GET /v1/submissions/:id`. */
export function getSubmission(
  id: string,
  options: { signal?: AbortSignal; fetch?: FetchLike } = {},
): Promise<Submission> {
  return apiRequest(
    `/v1/submissions/${encodeURIComponent(id)}`,
    submissionSchema,
    options,
  );
}

/** `GET /v1/submissions` for one problem, newest first. */
export function listProblemSubmissions(
  paperId: string,
  problemId: string,
  options: { cursor?: string; signal?: AbortSignal; fetch?: FetchLike } = {},
): Promise<SubmissionList> {
  const query = new URLSearchParams({ paperId, problemId, limit: "20" });
  if (options.cursor) query.set("cursor", options.cursor);
  return apiRequest(`/v1/submissions?${query}`, submissionListSchema, options);
}
