import { z } from "zod";
import {
  INGESTION_SOURCE_TYPES,
  INGESTION_STATUSES,
  PIPELINE_STAGES,
  STEP_STATUSES,
} from "../pipeline";
import { contentTagSchema } from "../content";
import { ROLES } from "../accounts";
import { ARXIV_REFERENCE_MAX_LENGTH } from "../arxiv";
import {
  CHECK_IDS,
  currentStepSchema,
  ingestionOptionsSchema,
  ingestionUsageSchema,
  outlineSchema,
  planSchema,
  planStepSchema,
  reportSchema,
  verificationSchema,
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
    /** An arXiv id or a link to the paper (docs/specs/14-cms.md §5). */
    arxivId: z.string().trim().min(1).max(ARXIV_REFERENCE_MAX_LENGTH).optional(),
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
  /** Why the draft cannot be published yet; empty when it can, null when not reviewable. */
  publishProblems: z.array(z.string()).nullable(),
  /** Whether the pipeline has tasks queued or running for this ingestion. */
  busy: z.boolean(),
  options: ingestionOptionsSchema,
  model: z.string(),
  promptVersion: z.string(),
  outline: outlineSchema.nullable(),
  plan: planSchema.nullable(),
  report: reportSchema.nullable(),
  stepStates: z.array(ingestionStepSchema),
});
export type IngestionDetail = z.infer<typeof ingestionDetailSchema>;

// ── Review (§10–§12) ─────────────────────────────────────────────────────────────

export const stepParamsSchema = z.object({
  id: z.uuid(),
  stepId: z.string().min(1).max(64),
});

/** Paper metadata as a maintainer edits it on the review screen. */
export const paperMetadataEditSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  authors: z.array(z.string().trim().min(1).max(200)).max(50),
  year: z.number().int().min(1900).max(2100).nullable(),
  url: z.union([
    z.literal(""),
    z.url({ protocol: /^https$/, error: "must be an https URL" }),
  ]),
  summary: z.string().trim().min(1).max(300),
  tags: z.array(contentTagSchema).max(8),
});
export type PaperMetadataEdit = z.infer<typeof paperMetadataEditSchema>;

/** `PATCH /ingestions/:id`: paper metadata, and every step in its new order with its title. */
export const updateDraftSchema = z.strictObject({
  paper: paperMetadataEditSchema.optional(),
  steps: z
    .array(
      z.strictObject({
        stepId: z.string().min(1).max(64),
        title: z.string().trim().min(1).max(200),
      }),
    )
    .optional(),
});
export type UpdateDraft = z.infer<typeof updateDraftSchema>;

export const verifyStepRequestSchema = z.strictObject({ full: z.boolean() });
export const regenerateStepRequestSchema = z.strictObject({
  note: z.string().trim().min(1).max(2000),
});
export const addStepRequestBodySchema = z.strictObject({
  description: z.string().trim().min(1).max(1000),
});
export const waiveRequestSchema = z.strictObject({
  check: z.enum(["V7", "V8"]),
  reason: z.string().trim().min(3).max(1000),
});

/** A step's plan entry and its files as they stand, with their last verification. */
export const ingestionStepFilesSchema = z.object({
  step: planStepSchema,
  current: currentStepSchema,
});
export type IngestionStepFiles = z.infer<typeof ingestionStepFilesSchema>;

export const reverifyResponseSchema = z.object({
  queued: z.boolean(),
  verification: verificationSchema.nullable(),
});
export type ReverifyResponse = z.infer<typeof reverifyResponseSchema>;

export const publishedPaperSchema = z.object({
  paperId: z.string(),
  version: z.number().int(),
  publishedAt: isoTimestamp.nullable(),
});
export type PublishedPaper = z.infer<typeof publishedPaperSchema>;

// ── Papers and users (docs/specs/05-api.md §8) ──────────────────────────────────

export const adminPaperSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  source: z.enum(["repo", "pipeline", "manual"]),
  /** The live version; null for a draft never published. */
  version: z.number().int().nullable(),
  problemCount: z.number().int(),
  publishedAt: isoTimestamp.nullable(),
  updatedAt: isoTimestamp,
  /** The ingestion behind a pipeline paper, for its review screen. */
  ingestionId: z.uuid().nullable(),
});
export type AdminPaper = z.infer<typeof adminPaperSchema>;
export const adminPaperListSchema = z.object({ papers: z.array(adminPaperSchema) });
export type AdminPaperList = z.infer<typeof adminPaperListSchema>;
export const paperIdParamsSchema = z.object({ paperId: z.string().min(1).max(64) });

export const adminUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  createdAt: isoTimestamp,
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export const adminUserListSchema = z.object({ users: z.array(adminUserSchema) });
export type AdminUserList = z.infer<typeof adminUserListSchema>;
export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(254).default(""),
});
export const adminUserParamsSchema = z.object({ id: z.string().min(1).max(64) });
export const setRoleSchema = z.strictObject({ role: z.enum(ROLES) });
