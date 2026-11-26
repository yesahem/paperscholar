import type {
  ColdMail,
  ColdMailCreated,
  ColdMailList,
  CreateColdMail,
  Cv,
  CvList,
} from "@repo/shared";
import {
  COLD_MAIL_STATUSES,
  COLD_MAIL_TARGET_TYPES,
  COLD_MAIL_TONES,
} from "@repo/shared/cold-mail";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { apiRequest, type CallOptions } from "@repo/web-core/api/client";

/**
 * CVs and cold-mail drafts (docs/specs/10-secondary-features.md §6). Each
 * schema mirrors the one in @repo/shared; the type annotation keeps them in step.
 */

export const cvSchema: z.ZodMiniType<Cv> = z.object({
  id: z.string(),
  filename: z.string(),
  sizeBytes: z.number(),
  pages: z.nullable(z.number()),
  uploadedAt: z.string(),
});

export const cvListSchema: z.ZodMiniType<CvList> = z.object({ items: z.array(cvSchema) });

export const coldMailSchema: z.ZodMiniType<ColdMail> = z.object({
  id: z.string(),
  status: z.enum(COLD_MAIL_STATUSES),
  targetType: z.enum(COLD_MAIL_TARGET_TYPES),
  target: z.object({
    name: z.string(),
    organisation: z.string(),
    role: z.nullable(z.string()),
    notes: z.nullable(z.string()),
  }),
  tone: z.enum(COLD_MAIL_TONES),
  cv: z.nullable(z.object({ id: z.string(), filename: z.string() })),
  subject: z.nullable(z.string()),
  body: z.nullable(z.string()),
  highlights: z.nullable(z.array(z.string())),
  failure: z.nullable(z.string()),
  createdAt: z.string(),
  finishedAt: z.nullable(z.string()),
});

export const coldMailListSchema: z.ZodMiniType<ColdMailList> = z.object({
  items: z.array(coldMailSchema),
  nextCursor: z.nullable(z.string()),
});

const createdSchema: z.ZodMiniType<ColdMailCreated> = z.object({ id: z.string() });

export function getCvs(options: CallOptions = {}): Promise<CvList> {
  return apiRequest("/v1/cv", cvListSchema, options);
}

export function uploadCv(file: File, options: CallOptions = {}): Promise<Cv> {
  const form = new FormData();
  form.append("cv", file);
  return apiRequest("/v1/cv", cvSchema, { ...options, method: "POST", body: form });
}

export function deleteCv(id: string, options: CallOptions = {}): Promise<void> {
  return apiRequest(`/v1/cv/${encodeURIComponent(id)}`, null, {
    ...options,
    method: "DELETE",
  });
}

export function createColdMail(
  body: CreateColdMail,
  options: CallOptions = {},
): Promise<ColdMailCreated> {
  return apiRequest("/v1/cold-mails", createdSchema, {
    ...options,
    method: "POST",
    body,
  });
}

export function getColdMail(id: string, options: CallOptions = {}): Promise<ColdMail> {
  return apiRequest(`/v1/cold-mails/${encodeURIComponent(id)}`, coldMailSchema, options);
}

export function getColdMails(
  cursor: string | null,
  options: CallOptions = {},
): Promise<ColdMailList> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return apiRequest(`/v1/cold-mails${query}`, coldMailListSchema, options);
}
