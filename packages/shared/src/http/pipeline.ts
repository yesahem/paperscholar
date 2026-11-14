import { z } from "zod";
import {
  INGESTION_SOURCE_TYPES,
  INGESTION_STATUSES,
  PIPELINE_STAGES,
  STEP_STATUSES,
} from "../pipeline";
import {
  CHECK_IDS,
  ingestionOptionsSchema,
  ingestionUsageSchema,
  outlineSchema,
  planSchema,
  reportSchema,
} from "../pipeline-schemas";

/**
 * Request and response bodies of the maintainer pipeline endpoints
 * (docs/specs/09-paper-pipeline.md §16, docs/specs/05-api.md §8).
 */

const isoTimestamp = z.iso.datetime({ offset: true });

export const uploadUrlRequestSchema = z.strictObject({
  filename: z.string().trim().min(1).max(255),
  /** Exact size in bytes; signed into the upload URL. */
  size: z.number().int().min(1),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z.object({
  /** Pass to `POST /ingestions` once the upload has finished. */
  pdfKey: z.string(),
  upload: z.object({
    /** Absolute (straight to storage) or relative to the site (through the API). */
    url: z.string(),
    method: z.literal("PUT"),
    /** Send exactly these headers with the file as the body. */
    headers: z.record(z.string(), z.string()),
  }),
  expiresAt: isoTimestamp,
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

export const createIngestionSchema = z
  .strictObject({
    pdfKey: z.string().min(1).max(512).optional(),
    arxivId: z.string().trim().min(1).max(100).optional(),
    options: ingestionOptionsSchema.default({
      targetSteps: null,
      environment: null,
      focus: null,
      pauseAfterPlan: false,
    }),
    /** The maintainer confirms they may use the paper for learning material (§4). */
    rightsConfirmed: z.literal(true, { error: "confirm you may use this paper" }),
    /** Ingest a paper that was already published, again. */
    force: z.boolean().default(false),
  })
  .refine((body) => (body.pdfKey === undefined) !== (body.arxivId === undefined), {
    message: "send either pdfKey or arxivId",
    path: ["pdfKey"],
  });
export type CreateIngestion = z.input<typeof createIngestionSchema>;

export const ingestionCreatedSchema = z.object({
  id: z.uuid(),
  status: z.enum(INGESTION_STATUSES),
  /** False when the same paper was already ingested and that ingestion is returned. */
  created: z.boolean(),
});
export type IngestionCreated = z.infer<typeof ingestionCreatedSchema>;

export const ingestionParamsSchema = z.object({ id: z.uuid() });
export const uploadParamsSchema = z.object({ uploadId: z.uuid() });

/** One check's result, as kept beside a step for lists. */
export const stepCheckSummarySchema = z.object({
  id: z.enum(CHECK_IDS),
  status: z.enum(["passed", "failed", "skipped", "waived"]),
  reason: z.string().nullable(),
});

export const stepVerificationSummarySchema = z.object({
  passed: z.boolean(),
  full: z.boolean(),
  filesHash: z.string(),
  verifiedAt: isoTimestamp,
  checks: z.array(stepCheckSummarySchema),
});
export type StepVerificationSummary = z.infer<typeof stepVerificationSummarySchema>;

export const waiverSchema = z.object({
  check: z.enum(["V7", "V8"]),
  reason: z.string(),
  by: z.string(),
  at: isoTimestamp,
});
export type Waiver = z.infer<typeof waiverSchema>;

export const ingestionStepSchema = z.object({
  stepId: z.string(),
  position: z.number().int(),
  title: z.string(),
  status: z.enum(STEP_STATUSES),
  attempts: z.number().int(),
  verification: stepVerificationSummarySchema.nullable(),
  waivers: z.array(waiverSchema),
});
export type IngestionStep = z.infer<typeof ingestionStepSchema>;

export const ingestionSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum(INGESTION_STATUSES),
  title: z.string().nullable(),
  sourceType: z.enum(INGESTION_SOURCE_TYPES),
  sourceRef: z.string().nullable(),
  paperId: z.string().nullable(),
  error: z.string().nullable(),
  failedStage: z.enum(PIPELINE_STAGES).nullable(),
  createdBy: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  finishedAt: isoTimestamp.nullable(),
  steps: z.object({
    total: z.number().int(),
    verified: z.number().int(),
    needsAttention: z.number().int(),
  }),
  usage: ingestionUsageSchema,
});
export type IngestionSummary = z.infer<typeof ingestionSummarySchema>;

export const ingestionListSchema = z.object({
  ingestions: z.array(ingestionSummarySchema),
});
export type IngestionList = z.infer<typeof ingestionListSchema>;

export const ingestionDetailSchema = ingestionSummarySchema.extend({
  options: ingestionOptionsSchema,
  model: z.string(),
  promptVersion: z.string(),
  outline: outlineSchema.nullable(),
  plan: planSchema.nullable(),
  report: reportSchema.nullable(),
  stepStates: z.array(ingestionStepSchema),
});
export type IngestionDetail = z.infer<typeof ingestionDetailSchema>;
