import { desc, schema, sql } from "@repo/db";
import {
  addStep,
  cancelIngestion,
  createIngestion,
  discardIngestion,
  getStepFiles,
  publishIngestion,
  publishReadiness,
  regenerateStep,
  removeStep,
  retryIngestion,
  reverifyStep,
  savePlan,
  saveStepFiles,
  updateDraft,
  waiveCheck,
  type Plan,
  type StepFiles,
  fetchArxivPdf,
  findArxivIngestion,
  getIngestionState,
  ingestionKeys,
  isPdf,
  outlineSchema,
  parseArxivId,
  PipelineError,
  planSchema,
  readJson,
  reportSchema,
  uploadKey,
  uploadPrefix,
  type PipelineDeps,
} from "@repo/pipeline";
import {
  createIngestionSchema,
  ingestionOptionsSchema,
  ingestionStepSchema,
  ingestionUsageSchema,
  stepVerificationSummarySchema,
  waiverSchema,
  type IngestionCreated,
  type IngestionDetail,
  type IngestionStep,
  type IngestionStepFiles,
  type PublishedPaper,
  type ReverifyResponse,
  type UpdateDraft,
  type IngestionSummary,
  type UploadUrlRequest,
  type UploadUrlResponse,
} from "@repo/shared";
import { z } from "zod";
import { AppError } from "../lib/errors";

/** How long a browser has to finish an upload. */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
/** Where the API takes uploads itself, for storage drivers with no presigned URLs. */
export const PDF_UPLOAD_PATH_PREFIX = "/api/v1/admin/ingestions/uploads/";
const LIST_LIMIT = 100;

/** Pipeline errors as API errors with messages a maintainer can act on. */
export function toAppError(error: unknown): unknown {
  if (!(error instanceof PipelineError)) return error;
  switch (error.code) {
    case "invalid_pdf":
    case "too_many_pages":
      return new AppError("validation_error", { message: error.message, cause: error });
    case "too_large":
      return new AppError("payload_too_large", { message: error.message, cause: error });
    case "limit_reached":
      return new AppError("quota_exceeded", {
        message: error.message,
        cause: error,
        retryAfterSeconds: 60 * 60,
      });
    case "conflict":
    case "invalid_state":
      return new AppError("conflict", { message: error.message, cause: error });
    case "not_found":
      return new AppError("not_found", { message: error.message, cause: error });
  }
}

type IngestionRow = typeof schema.ingestions.$inferSelect;
type StepRow = typeof schema.ingestionSteps.$inferSelect;

function stepState(row: StepRow): IngestionStep {
  const verification = stepVerificationSummarySchema.safeParse(row.verification);
  return ingestionStepSchema.parse({
    stepId: row.stepId,
    position: row.position,
    title: row.title,
    status: row.status,
    attempts: row.attempts,
    verification: verification.success ? verification.data : null,
    waivers: z.array(waiverSchema).catch([]).parse(row.waivers),
  });
}

function summary(row: IngestionRow, steps: StepRow[]): IngestionSummary {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    paperId: row.paperId,
    error: row.error,
    failedStage: row.failedStage,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    steps: {
      total: steps.length,
      verified: steps.filter((step) => step.status === "verified").length,
      needsAttention: steps.filter((step) => step.status === "needs_attention").length,
    },
    usage: ingestionUsageSchema.parse(row.usage),
  };
}

export interface IngestionsOptions {
  deps: PipelineDeps;
  /**
   * Starts the pipeline after new work is queued (docs/specs/09-paper-pipeline.md §13).
   * `origin` is this API's own origin, as the request reached it.
   */
  kick: (origin: string) => void;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** The maintainer's side of the pipeline: intake and progress (§4, §16). */
export function createIngestions({
  deps,
  kick,
  fetch: fetchImpl,
  now = () => new Date(),
}: IngestionsOptions) {
  const { storage, settings, db } = deps;

  return {
    /** Where the browser sends the PDF: storage itself when it can presign, else the API. */
    async uploadUrl(
      userId: string,
      request: UploadUrlRequest,
    ): Promise<UploadUrlResponse> {
      if (request.size > settings.maxPdfBytes) {
        throw new AppError("payload_too_large", {
          message: `The PDF is larger than ${Math.round(settings.maxPdfBytes / 1024 / 1024)} MB.`,
          details: { maxBytes: settings.maxPdfBytes },
        });
      }
      const uploadId = crypto.randomUUID();
      const pdfKey = uploadKey(userId, uploadId);
      const presigned = await storage.presignPut(pdfKey, {
        contentType: "application/pdf",
        contentLength: request.size,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      });
      const expiresAt = new Date(now().getTime() + UPLOAD_URL_TTL_SECONDS * 1000);
      return {
        pdfKey,
        upload: presigned
          ? { url: presigned.url, method: "PUT", headers: presigned.headers }
          : {
              url: `${PDF_UPLOAD_PATH_PREFIX}${uploadId}`,
              method: "PUT",
              headers: { "content-type": "application/pdf" },
            },
        expiresAt: (presigned?.expiresAt ?? expiresAt).toISOString(),
      };
    },

    /** The upload itself, for drivers without presigned URLs (`fs`). */
    async receiveUpload(
      userId: string,
      uploadId: string,
      body: Uint8Array,
    ): Promise<void> {
      if (body.byteLength > settings.maxPdfBytes) throw new AppError("payload_too_large");
      if (!isPdf(body)) {
        throw new AppError("validation_error", { message: "The file is not a PDF." });
      }
      await storage.put(uploadKey(userId, uploadId), body, {
        contentType: "application/pdf",
      });
    },

    /** Starts an ingestion from an upload or an arXiv id, or returns the existing one. */
    async create(
      userId: string,
      body: z.output<typeof createIngestionSchema>,
      origin: string,
    ): Promise<IngestionCreated> {
      const { options } = body;
      try {
        if (body.arxivId !== undefined) {
          const arxivId = parseArxivId(body.arxivId);
          if (!arxivId) {
            throw new AppError("validation_error", {
              message: "That is not an arXiv id such as 1706.03762.",
              details: { issues: [{ path: "arxivId", message: "is not an arXiv id" }] },
            });
          }
          const existing = await findArxivIngestion(db, arxivId);
          if (existing && !(body.force && existing.status === "published")) {
            return { ...existing, created: false };
          }
          const pdf = await fetchArxivPdf(arxivId, {
            maxBytes: settings.maxPdfBytes,
            ...(fetchImpl ? { fetch: fetchImpl } : {}),
          });
          const result = await createIngestion(deps, {
            pdf,
            sourceType: "arxiv",
            sourceRef: arxivId,
            options,
            createdBy: userId,
            force: body.force,
          });
          if (result.created) kick(origin);
          return result;
        }

        // Only the uploader's own uploads can be used.
        const key = body.pdfKey ?? "";
        if (!key.startsWith(uploadPrefix(userId)) || !key.endsWith(".pdf")) {
          throw new AppError("validation_error", {
            message: "Upload the PDF first; that upload is not yours.",
            details: {
              issues: [{ path: "pdfKey", message: "is not one of your uploads" }],
            },
          });
        }
        const upload = await storage.get(key);
        if (!upload) {
          throw new AppError("validation_error", {
            message: "The upload has not arrived. Upload the PDF again.",
            details: { issues: [{ path: "pdfKey", message: "has no upload" }] },
          });
        }
        const result = await createIngestion(deps, {
          pdf: upload.body,
          sourceType: "pdf",
          sourceRef: null,
          options,
          createdBy: userId,
          force: body.force,
        });
        await storage.delete(key);
        if (result.created) kick(origin);
        return result;
      } catch (error) {
        throw toAppError(error);
      }
    },

    async list(): Promise<IngestionSummary[]> {
      const rows = await db
        .select()
        .from(schema.ingestions)
        .orderBy(desc(schema.ingestions.createdAt))
        .limit(LIST_LIMIT);
      if (rows.length === 0) return [];
      const steps = await db
        .select()
        .from(schema.ingestionSteps)
        .where(
          sql`${schema.ingestionSteps.ingestionId} in (${sql.join(
            rows.map((row) => sql`${row.id}`),
            sql`, `,
          )})`,
        );
      return rows.map((row) =>
        summary(
          row,
          steps.filter((step) => step.ingestionId === row.id),
        ),
      );
    },

    async get(id: string): Promise<IngestionDetail> {
      const state = await getIngestionState(db, id);
      if (!state)
        throw new AppError("not_found", { message: "No ingestion has that id." });
      const keys = ingestionKeys(id);
      const [outline, plan, report] = await Promise.all([
        readJson(storage, keys.outline, outlineSchema),
        readJson(storage, keys.plan, planSchema),
        readJson(storage, keys.report, reportSchema),
      ]);
      const reviewable = ["ready_for_review", "published"].includes(
        state.ingestion.status,
      );
      return {
        ...summary(state.ingestion, state.steps),
        publishProblems: reviewable
          ? await publishReadiness(deps, id).catch(() => null)
          : null,
        busy: state.tasks.some(
          (task) => task.status === "pending" || task.status === "running",
        ),
        options: ingestionOptionsSchema.parse(state.ingestion.options),
        model: state.ingestion.model,
        promptVersion: state.ingestion.promptVersion,
        outline,
        plan,
        report,
        stepStates: state.steps.map(stepState),
      };
    },

    // ── Review (docs/specs/09-paper-pipeline.md §10–§12) ──────────────────────

    savePlan: (id: string, plan: Plan, origin: string) =>
      mapped(async () => {
        await savePlan(deps, id, plan);
        kick(origin);
      }),

    updateDraft: (id: string, changes: UpdateDraft) =>
      mapped(() => updateDraft(deps, id, changes)),

    getStep: (id: string, stepId: string): Promise<IngestionStepFiles> =>
      mapped(() => getStepFiles(deps, id, stepId)),

    saveStep: (
      id: string,
      stepId: string,
      files: StepFiles,
    ): Promise<IngestionStepFiles> =>
      mapped(async () => {
        await saveStepFiles(deps, id, stepId, files);
        return getStepFiles(deps, id, stepId);
      }),

    verifyStep: (
      id: string,
      stepId: string,
      full: boolean,
      origin: string,
    ): Promise<ReverifyResponse> =>
      mapped(async () => {
        const result = await reverifyStep(deps, id, stepId, { full });
        if (result.queued) kick(origin);
        return result;
      }),

    regenerateStep: (
      id: string,
      stepId: string,
      note: string,
      by: string,
      origin: string,
    ) =>
      mapped(async () => {
        await regenerateStep(deps, id, stepId, { note, by });
        kick(origin);
      }),

    addStep: (id: string, description: string, by: string, origin: string) =>
      mapped(async () => {
        await addStep(deps, id, { description, by });
        kick(origin);
      }),

    removeStep: (id: string, stepId: string) =>
      mapped(() => removeStep(deps, id, stepId)),

    waive: (id: string, stepId: string, check: "V7" | "V8", reason: string, by: string) =>
      mapped(() => waiveCheck(deps, id, stepId, { check, reason, by })),

    publish: (id: string, by: string): Promise<PublishedPaper> =>
      mapped(async () => {
        const entry = await publishIngestion(deps, id, by);
        return {
          paperId: entry.id,
          version: entry.version,
          publishedAt: entry.publishedAt,
        };
      }),

    cancel: (id: string) => mapped(() => cancelIngestion(deps, id)),

    retry: (id: string, origin: string) =>
      mapped(async () => {
        await retryIngestion(deps, id);
        kick(origin);
      }),

    discard: (id: string) => mapped(() => discardIngestion(deps, id)),
  };
}

/** Runs a pipeline call, turning its errors into API errors. */
async function mapped<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toAppError(error);
  }
}

export type Ingestions = ReturnType<typeof createIngestions>;
