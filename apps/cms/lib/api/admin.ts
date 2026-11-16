import {
  adminPaperListSchema,
  adminPaperSchema,
  adminUserListSchema,
  adminUserSchema,
  ingestionCreatedSchema,
  ingestionDetailSchema,
  ingestionListSchema,
  ingestionStepFilesSchema,
  publishedPaperSchema,
  reverifyResponseSchema,
  uploadUrlResponseSchema,
  type AdminPaper,
  type AdminPaperList,
  type AdminUser,
  type AdminUserList,
  type CreateIngestion,
  type IngestionCreated,
  type IngestionDetail,
  type IngestionList,
  type IngestionStepFiles,
  type Plan,
  type PublishedPaper,
  type ReverifyResponse,
  type Role,
  type StepFiles,
  type UpdateDraft,
} from "@repo/shared";
import { apiRequest, type CallOptions } from "@repo/web-core/api/client";
import { ApiError } from "@repo/web-core/api/errors";

/**
 * The maintainer endpoints (docs/specs/09-paper-pipeline.md §16, 05 §8).
 * Used by the CMS screens, which load the full zod schemas of
 * @repo/shared load there and nowhere else.
 */

const ingestion = (id: string) => `/v1/admin/ingestions/${encodeURIComponent(id)}`;
const step = (id: string, stepId: string) =>
  `${ingestion(id)}/steps/${encodeURIComponent(stepId)}`;

export function listIngestions(options: CallOptions = {}): Promise<IngestionList> {
  return apiRequest("/v1/admin/ingestions", ingestionListSchema, options);
}

export function getIngestion(
  id: string,
  options: CallOptions = {},
): Promise<IngestionDetail> {
  return apiRequest(ingestion(id), ingestionDetailSchema, options);
}

/**
 * Uploads the PDF where the API says (straight to storage, or through the
 * API), then starts the ingestion. Returns the existing one for a paper
 * already ingested.
 */
export async function startIngestion(
  source: { file: File } | { arxivId: string },
  body: Omit<CreateIngestion, "pdfKey" | "arxivId">,
  options: CallOptions = {},
): Promise<IngestionCreated> {
  if ("arxivId" in source) {
    return apiRequest("/v1/admin/ingestions", ingestionCreatedSchema, {
      ...options,
      method: "POST",
      body: { ...body, arxivId: source.arxivId },
    });
  }
  const target = await apiRequest(
    "/v1/admin/ingestions/upload-url",
    uploadUrlResponseSchema,
    {
      ...options,
      method: "POST",
      body: { filename: source.file.name, size: source.file.size },
    },
  );
  const fetchImpl = options.fetch ?? fetch;
  // A relative URL goes through the site's /api proxy with the session; an absolute one straight to storage.
  const relative = target.upload.url.startsWith("/");
  const response = await fetchImpl(target.upload.url, {
    method: "PUT",
    headers: relative
      ? { "content-type": target.upload.headers["content-type"] ?? "application/pdf" }
      : // The browser sets Content-Length itself from the body.
        Object.fromEntries(
          Object.entries(target.upload.headers).filter(
            ([name]) => name !== "content-length",
          ),
        ),
    body: source.file,
    credentials: relative ? "same-origin" : "omit",
    signal: options.signal,
  }).catch((error: unknown) => {
    throw new ApiError(
      "The upload did not reach the server. Check your connection.",
      null,
      null,
      { cause: error },
    );
  });
  if (!response.ok) {
    throw new ApiError(
      `The upload was refused (${response.status}). Try again.`,
      response.status,
      null,
    );
  }
  return apiRequest("/v1/admin/ingestions", ingestionCreatedSchema, {
    ...options,
    method: "POST",
    body: { ...body, pdfKey: target.pdfKey },
  });
}

export function savePlan(
  id: string,
  plan: Plan,
  options: CallOptions = {},
): Promise<IngestionDetail> {
  return apiRequest(`${ingestion(id)}/plan`, ingestionDetailSchema, {
    ...options,
    method: "PUT",
    body: plan,
  });
}

export function updateDraft(
  id: string,
  changes: UpdateDraft,
  options: CallOptions = {},
): Promise<IngestionDetail> {
  return apiRequest(ingestion(id), ingestionDetailSchema, {
    ...options,
    method: "PATCH",
    body: changes,
  });
}

export function getStep(
  id: string,
  stepId: string,
  options: CallOptions = {},
): Promise<IngestionStepFiles> {
  return apiRequest(step(id, stepId), ingestionStepFilesSchema, options);
}

export function saveStep(
  id: string,
  stepId: string,
  files: StepFiles,
  options: CallOptions = {},
): Promise<IngestionStepFiles> {
  return apiRequest(step(id, stepId), ingestionStepFilesSchema, {
    ...options,
    method: "PUT",
    body: files,
  });
}

export function verifyStep(
  id: string,
  stepId: string,
  full: boolean,
  options: CallOptions = {},
): Promise<ReverifyResponse> {
  return apiRequest(`${step(id, stepId)}/verify`, reverifyResponseSchema, {
    ...options,
    method: "POST",
    body: { full },
  });
}

export function regenerateStep(
  id: string,
  stepId: string,
  note: string,
  options: CallOptions = {},
) {
  return apiRequest(`${step(id, stepId)}/regenerate`, ingestionDetailSchema, {
    ...options,
    method: "POST",
    body: { note },
  });
}

export function waiveCheck(
  id: string,
  stepId: string,
  check: "V7" | "V8",
  reason: string,
  options: CallOptions = {},
): Promise<IngestionDetail> {
  return apiRequest(`${step(id, stepId)}/waive`, ingestionDetailSchema, {
    ...options,
    method: "POST",
    body: { check, reason },
  });
}

export function addStep(
  id: string,
  description: string,
  options: CallOptions = {},
): Promise<IngestionDetail> {
  return apiRequest(`${ingestion(id)}/steps`, ingestionDetailSchema, {
    ...options,
    method: "POST",
    body: { description },
  });
}

export function removeStep(
  id: string,
  stepId: string,
  options: CallOptions = {},
): Promise<void> {
  return apiRequest(step(id, stepId), null, { ...options, method: "DELETE" });
}

export function publishIngestion(
  id: string,
  options: CallOptions = {},
): Promise<PublishedPaper> {
  return apiRequest(`${ingestion(id)}/publish`, publishedPaperSchema, {
    ...options,
    method: "POST",
  });
}

export function cancelIngestion(
  id: string,
  options: CallOptions = {},
): Promise<IngestionDetail> {
  return apiRequest(`${ingestion(id)}/cancel`, ingestionDetailSchema, {
    ...options,
    method: "POST",
  });
}

export function retryIngestion(
  id: string,
  options: CallOptions = {},
): Promise<IngestionDetail> {
  return apiRequest(`${ingestion(id)}/retry`, ingestionDetailSchema, {
    ...options,
    method: "POST",
  });
}

export function discardIngestion(id: string, options: CallOptions = {}): Promise<void> {
  return apiRequest(ingestion(id), null, { ...options, method: "DELETE" });
}

export function listAdminPapers(options: CallOptions = {}): Promise<AdminPaperList> {
  return apiRequest("/v1/admin/papers", adminPaperListSchema, options);
}

export function setPaperStatus(
  paperId: string,
  action: "publish" | "archive",
  options: CallOptions = {},
): Promise<AdminPaper> {
  return apiRequest(
    `/v1/admin/papers/${encodeURIComponent(paperId)}/${action}`,
    adminPaperSchema,
    {
      ...options,
      method: "POST",
    },
  );
}

export function listUsers(
  query: string,
  options: CallOptions = {},
): Promise<AdminUserList> {
  return apiRequest(
    `/v1/admin/users?${new URLSearchParams({ q: query })}`,
    adminUserListSchema,
    options,
  );
}

export function setUserRole(
  id: string,
  role: Role,
  options: CallOptions = {},
): Promise<AdminUser> {
  return apiRequest(`/v1/admin/users/${encodeURIComponent(id)}`, adminUserSchema, {
    ...options,
    method: "PATCH",
    body: { role },
  });
}
