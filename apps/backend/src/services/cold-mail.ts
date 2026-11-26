import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  or,
  schema,
  type Database,
} from "@repo/db";
import { countPdfPages, isPdf, LlmError, type LlmClient } from "@repo/pipeline";
import {
  coldMailDraftSchema,
  CV_MAX_BYTES,
  CV_MAX_PAGES,
  CV_MAX_PER_USER,
  type ColdMail,
  type ColdMailList,
  type CreateColdMail,
  type Cv,
  type ListColdMailsQuery,
} from "@repo/shared";
import type { Logger } from "@repo/shared/logger";
import type { ObjectStorage } from "@repo/storage";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { AppError } from "../lib/errors";
import { COLD_MAIL_SYSTEM, coldMailPrompt } from "./cold-mail-prompt";
import type { RateLimiter } from "./rate-limiter";
import { utcDay } from "./submissions";

type CvRow = typeof schema.cvDocuments.$inferSelect;
type MailRow = typeof schema.coldMails.$inferSelect;

/** CV uploads per user per hour, with avatars' limit (docs/specs/11-security-ops.md §3). */
const UPLOADS_PER_HOUR = 10;
/** A generation still pending after this was lost with its process; it is marked failed. */
export const STALE_GENERATION_MS = 10 * 60 * 1000;
/** Output allowance: room for adaptive thinking and a short email. */
const MAX_OUTPUT_TOKENS = 8_000;

/** What a failed generation tells the user. Never vendor text. */
export const FAILURES = {
  declined:
    "A draft could not be written for this CV and request. Try different notes, or another CV.",
  busy: "The writing service is busy. Try again in a few minutes; this one was not counted.",
  unavailable:
    "The draft could not be written. Try again later; this one was not counted.",
  cvMissing: "The CV for this draft was deleted before it was written.",
  lost: "The draft was interrupted. Try again; this one was not counted.",
} as const;

/** `uploads/cv/<userId>/<cvId>.pdf` in the private bucket (docs/specs/03-content.md §2.1). */
export function cvKey(userId: string, cvId: string): string {
  return `uploads/cv/${userId}/${cvId}.pdf`;
}

export interface ColdMailDependencies {
  db: Database;
  storage: ObjectStorage;
  /** Null on an instance without a model; the feature is then off. */
  llm: LlmClient | null;
  limiter: RateLimiter;
  /** Generations per user per UTC day; failed ones are not counted. */
  perDay: number;
  logger: Logger;
  /** Starts `generate(id)` without delaying the response. */
  dispatch: (coldMailId: string) => void;
  now?: () => Date;
}

export interface ColdMailService {
  uploadCv(userId: string, file: { bytes: Uint8Array; filename: string }): Promise<Cv>;
  listCvs(userId: string): Promise<Cv[]>;
  deleteCv(userId: string, cvId: string): Promise<void>;
  /** Removes every CV file of a user; called before the account is deleted. */
  deleteUserFiles(userId: string): Promise<void>;
  create(userId: string, input: CreateColdMail): Promise<{ id: string }>;
  /** Writes a pending draft. Idempotent: a second call for the same id does nothing. */
  generate(coldMailId: string): Promise<void>;
  get(userId: string, coldMailId: string): Promise<ColdMail>;
  list(userId: string, query: ListColdMailsQuery): Promise<ColdMailList>;
}

function toCv(row: CvRow): Cv {
  return {
    id: row.id,
    filename: row.filename,
    sizeBytes: row.sizeBytes,
    pages: row.pages,
    uploadedAt: row.createdAt.toISOString(),
  };
}

/** A filename safe to store and show: no path, no control characters, at most 120 characters. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? "";
  const printable = [...base].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 0x20 && code !== 0x7f;
  });
  const cleaned = printable.join("").trim().slice(0, 120);
  return cleaned === "" ? "cv.pdf" : cleaned;
}

function toColdMail(row: MailRow, cv: { id: string; filename: string } | null): ColdMail {
  return {
    id: row.id,
    status: row.status,
    targetType: row.targetType,
    target: {
      name: row.targetName,
      organisation: row.targetOrganisation,
      role: row.targetRole,
      notes: row.targetNotes,
    },
    tone: row.tone,
    cv,
    subject: row.subject,
    body: row.body,
    highlights: row.highlights,
    failure: row.failure,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/**
 * The cold-mail generator (docs/specs/10-secondary-features.md §6). CVs live
 * in the private bucket and are read only for their owner; a draft is written
 * by one model call that reads the CV inline, so the provider keeps no copy.
 * The platform never sends email.
 */
export function createColdMailService({
  db,
  storage,
  llm,
  limiter,
  perDay,
  logger,
  dispatch,
  now = () => new Date(),
}: ColdMailDependencies): ColdMailService {
  const cvs = schema.cvDocuments;
  const mails = schema.coldMails;

  async function ownCv(userId: string, cvId: string): Promise<CvRow | null> {
    const [row] = await db
      .select()
      .from(cvs)
      .where(and(eq(cvs.id, cvId), eq(cvs.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async function removeCv(row: CvRow): Promise<void> {
    await db.delete(cvs).where(eq(cvs.id, row.id));
    await storage.delete(row.storageKey);
  }

  async function finish(
    id: string,
    fields: Partial<Pick<MailRow, "subject" | "body" | "highlights" | "failure">> & {
      status: "done" | "failed";
      inputTokens?: number;
      outputTokens?: number;
    },
  ): Promise<void> {
    await db
      .update(mails)
      .set({ ...fields, finishedAt: now() })
      .where(and(eq(mails.id, id), eq(mails.status, "pending")));
  }

  /** Marks pending generations older than STALE_GENERATION_MS as failed. */
  async function reap(userId: string): Promise<void> {
    await db
      .update(mails)
      .set({ status: "failed", failure: FAILURES.lost, finishedAt: now() })
      .where(
        and(
          eq(mails.userId, userId),
          eq(mails.status, "pending"),
          lt(mails.createdAt, new Date(now().getTime() - STALE_GENERATION_MS)),
        ),
      );
  }

  async function cvsById(
    ids: (string | null)[],
  ): Promise<Map<string, { id: string; filename: string }>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const rows = await db
      .select({ id: cvs.id, filename: cvs.filename })
      .from(cvs)
      .where(inArray(cvs.id, wanted));
    return new Map(rows.map((row) => [row.id, row]));
  }

  return {
    async uploadCv(userId, { bytes, filename }) {
      const invalid = (message: string) =>
        new AppError("validation_error", {
          message: "Upload your CV as one PDF file.",
          details: { issues: [{ path: "cv", message }] },
        });
      if (bytes.byteLength > CV_MAX_BYTES) {
        throw new AppError("payload_too_large", { details: { maxBytes: CV_MAX_BYTES } });
      }
      if (bytes.byteLength === 0 || !isPdf(bytes)) throw invalid("is not a PDF file");
      const pages = countPdfPages(bytes);
      if (pages !== null && pages > CV_MAX_PAGES) {
        throw invalid(`has ${pages} pages; a CV may have at most ${CV_MAX_PAGES}`);
      }

      const hourly = await limiter.consume(`cv:user:${userId}`, {
        windowSeconds: 3600,
        max: UPLOADS_PER_HOUR,
      });
      if (!hourly.allowed) {
        const retryAfterSeconds = hourly.retryAfterSeconds ?? 3600;
        throw new AppError("rate_limited", {
          message: "You have uploaded several CVs recently. Try again later.",
          details: { retryAfterSeconds },
          retryAfterSeconds,
        });
      }

      const id = Bun.randomUUIDv7();
      const key = cvKey(userId, id);
      await storage.put(key, bytes, { contentType: "application/pdf" });
      const [row] = await db
        .insert(cvs)
        .values({
          id,
          userId,
          storageKey: key,
          filename: cleanFilename(filename),
          sizeBytes: bytes.byteLength,
          pages,
          createdAt: now(),
        })
        .returning();
      if (!row) throw new Error("The CV was not recorded");

      // Keep the newest few: a fourth upload replaces the oldest.
      const all = await db
        .select()
        .from(cvs)
        .where(eq(cvs.userId, userId))
        .orderBy(asc(cvs.createdAt), asc(cvs.id));
      for (const old of all.slice(0, Math.max(0, all.length - CV_MAX_PER_USER))) {
        await removeCv(old);
      }
      logger.info("cv uploaded", {
        userId,
        cvId: id,
        sizeBytes: bytes.byteLength,
        pages,
      });
      return toCv(row);
    },

    async listCvs(userId) {
      const rows = await db
        .select()
        .from(cvs)
        .where(eq(cvs.userId, userId))
        .orderBy(desc(cvs.createdAt), desc(cvs.id));
      return rows.map(toCv);
    },

    async deleteCv(userId, cvId) {
      const row = await ownCv(userId, cvId);
      if (!row) throw new AppError("not_found");
      await removeCv(row);
    },

    async deleteUserFiles(userId) {
      for await (const object of storage.list(`uploads/cv/${userId}/`)) {
        await storage.delete(object.key);
      }
    },

    async create(userId, input) {
      if (!llm) throw new AppError("not_found");
      const cv = await ownCv(userId, input.cvId);
      if (!cv) {
        throw new AppError("validation_error", {
          details: { issues: [{ path: "cvId", message: "is not one of your CVs" }] },
        });
      }
      await reap(userId);
      const day = utcDay(now());
      const [today] = await db
        .select({ value: count() })
        .from(mails)
        .where(
          and(
            eq(mails.userId, userId),
            gte(mails.createdAt, day.start),
            ne(mails.status, "failed"),
          ),
        );
      if ((today?.value ?? 0) >= perDay) {
        throw new AppError("quota_exceeded", {
          message: `You have written today's ${perDay} drafts. More are possible after midnight UTC.`,
          details: { resetsAt: day.end.toISOString() },
          retryAfterSeconds: Math.ceil((day.end.getTime() - now().getTime()) / 1000),
        });
      }
      const id = Bun.randomUUIDv7();
      await db.insert(mails).values({
        id,
        userId,
        cvId: cv.id,
        targetType: input.targetType,
        targetName: input.target.name,
        targetOrganisation: input.target.organisation,
        targetRole: input.target.role ?? null,
        targetNotes: input.target.notes ?? null,
        tone: input.tone,
        model: llm.model,
        createdAt: now(),
      });
      logger.info("cold mail requested", {
        coldMailId: id,
        userId,
        targetType: input.targetType,
      });
      dispatch(id);
      return { id };
    },

    async generate(coldMailId) {
      const [row] = await db
        .select()
        .from(mails)
        .where(and(eq(mails.id, coldMailId), eq(mails.status, "pending")))
        .limit(1);
      if (!row) return;
      if (!llm) {
        await finish(coldMailId, { status: "failed", failure: FAILURES.unavailable });
        return;
      }
      const cv = row.cvId ? await ownCv(row.userId, row.cvId) : null;
      const pdf = cv ? await storage.get(cv.storageKey) : null;
      if (!pdf) {
        await finish(coldMailId, { status: "failed", failure: FAILURES.cvMissing });
        return;
      }

      try {
        const { value, usage } = await llm.generate({
          purpose: "cold_mail",
          subject: coldMailId,
          system: COLD_MAIL_SYSTEM,
          document: { pdf: pdf.body },
          context: [],
          prompt: coldMailPrompt({
            targetType: row.targetType,
            target: {
              name: row.targetName,
              organisation: row.targetOrganisation,
              ...(row.targetRole ? { role: row.targetRole } : {}),
              ...(row.targetNotes ? { notes: row.targetNotes } : {}),
            },
            tone: row.tone,
          }),
          schema: coldMailDraftSchema,
          schemaName: "cold_mail_draft",
          effort: "medium",
          maxTokens: MAX_OUTPUT_TOKENS,
        });
        await finish(coldMailId, {
          status: "done",
          subject: value.subject,
          body: value.body,
          highlights: value.highlights,
          inputTokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
          outputTokens: usage.outputTokens,
        });
        logger.info("cold mail written", {
          coldMailId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
      } catch (error) {
        const kind = error instanceof LlmError ? error.kind : "unknown";
        const failure =
          kind === "refusal" || kind === "max_tokens" || kind === "invalid_output"
            ? FAILURES.declined
            : kind === "rate_limited" || kind === "overloaded" || kind === "connection"
              ? FAILURES.busy
              : FAILURES.unavailable;
        const usage = error instanceof LlmError ? error.usage : null;
        await finish(coldMailId, {
          status: "failed",
          failure,
          inputTokens: usage
            ? usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
            : 0,
          outputTokens: usage?.outputTokens ?? 0,
        });
        if (kind === "unknown" || kind === "bad_request" || kind === "authentication") {
          logger.error("cold mail generation failed", { coldMailId, kind, error });
        } else {
          logger.warn("cold mail not written", { coldMailId, kind });
        }
      }
    },

    async get(userId, coldMailId) {
      await reap(userId);
      const [row] = await db
        .select()
        .from(mails)
        .where(and(eq(mails.id, coldMailId), eq(mails.userId, userId)))
        .limit(1);
      if (!row) throw new AppError("not_found");
      const cv = (await cvsById([row.cvId])).get(row.cvId ?? "") ?? null;
      return toColdMail(row, cv);
    },

    async list(userId, { limit, cursor }) {
      await reap(userId);
      const after = cursor === undefined ? null : decodeCursor(cursor);
      const rows = await db
        .select()
        .from(mails)
        .where(
          and(
            eq(mails.userId, userId),
            after === null
              ? undefined
              : or(
                  lt(mails.createdAt, after.at),
                  and(eq(mails.createdAt, after.at), lt(mails.id, after.id)),
                ),
          ),
        )
        .orderBy(desc(mails.createdAt), desc(mails.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const known = await cvsById(page.map((row) => row.cvId));
      const last = page.at(-1);
      return {
        items: page.map((row) =>
          toColdMail(row, row.cvId ? (known.get(row.cvId) ?? null) : null),
        ),
        nextCursor:
          rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
      };
    },
  };
}
