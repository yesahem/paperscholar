import {
  and,
  desc,
  eq,
  gte,
  isUniqueViolation,
  or,
  schema,
  sql,
  type Database,
} from "@repo/db";
import type { IngestionSourceType, IngestionStatus } from "@repo/shared";
import type { PipelineDeps } from "./deps";
import { enqueue } from "./engine/queue";
import { PipelineError } from "./errors";
import { ingestionKeys } from "./keys";
import { PROMPT_VERSION } from "./prompts";
import { ingestionOptionsSchema } from "./schemas";

const PDF_SIGNATURE = "%PDF-";

/** Whether the bytes start like a PDF file. */
export function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes(PDF_SIGNATURE);
}

/**
 * Pages in a PDF, counted from its page objects; null when they are hidden in
 * compressed object streams. A guard against oversized uploads, not a parser:
 * the model reads the file itself.
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  const text = Buffer.from(bytes).toString("latin1");
  const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  return pages === 0 ? null : pages;
}

/** `1706.03762`, `1706.03762v5`, or an old-style id such as `math/0211159`. */
const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d+)?$/;

/** Accepts `arxiv:1706.03762`, an abs or pdf URL, or the bare id; returns the bare id. */
export function parseArxivId(input: string): string | null {
  const trimmed = input
    .trim()
    .replace(/^arxiv:/i, "")
    .replace(/^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\//, "")
    .replace(/\.pdf$/, "");
  return ARXIV_ID.test(trimmed) ? trimmed : null;
}

export interface IntakeInput {
  pdf: Uint8Array;
  sourceType: IngestionSourceType;
  /** The arXiv id, for arXiv intake. */
  sourceRef: string | null;
  options: unknown;
  /** The maintainer who started it; null for an operator's command with no account. */
  createdBy: string | null;
  /** Start a new ingestion of a paper that was already published. */
  force?: boolean;
}

export interface IntakeResult {
  id: string;
  status: IngestionStatus;
  /** False when an ingestion of the same paper already existed and is returned instead. */
  created: boolean;
}

/** The live ingestion of an arXiv paper, if any: checked before downloading it again. */
export async function findArxivIngestion(
  db: Database,
  arxivId: string,
): Promise<{ id: string; status: IngestionStatus } | null> {
  const [row] = await db
    .select({ id: schema.ingestions.id, status: schema.ingestions.status })
    .from(schema.ingestions)
    .where(
      and(
        eq(schema.ingestions.sourceRef, arxivId),
        sql`${schema.ingestions.status} not in ('failed', 'cancelled')`,
      ),
    )
    .orderBy(desc(schema.ingestions.createdAt))
    .limit(1);
  return row ?? null;
}

async function findExisting(
  db: Database,
  sha256: string,
  sourceRef: string | null,
): Promise<{ id: string; status: IngestionStatus } | null> {
  const [row] = await db
    .select({ id: schema.ingestions.id, status: schema.ingestions.status })
    .from(schema.ingestions)
    .where(
      and(
        sourceRef
          ? or(
              eq(schema.ingestions.pdfSha256, sha256),
              eq(schema.ingestions.sourceRef, sourceRef),
            )
          : eq(schema.ingestions.pdfSha256, sha256),
        sql`${schema.ingestions.status} not in ('failed', 'cancelled')`,
      ),
    )
    .orderBy(desc(schema.ingestions.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Intake (docs/specs/09-paper-pipeline.md §4): checks the file, returns an
 * existing ingestion of the same paper, or stores the PDF and queues stage 1.
 */
export async function createIngestion(
  deps: PipelineDeps,
  input: IntakeInput,
): Promise<IntakeResult> {
  const { db, settings } = deps;
  const now = deps.now?.() ?? new Date();
  const options = ingestionOptionsSchema.parse(input.options ?? {});

  if (!isPdf(input.pdf)) throw new PipelineError("invalid_pdf", "The file is not a PDF.");
  if (input.pdf.byteLength > settings.maxPdfBytes) {
    throw new PipelineError(
      "too_large",
      `The PDF is ${(input.pdf.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ${Math.round(settings.maxPdfBytes / 1024 / 1024)} MB.`,
    );
  }
  const pages = countPdfPages(input.pdf);
  if (pages !== null && pages > settings.maxPdfPages) {
    throw new PipelineError(
      "too_many_pages",
      `The PDF has ${pages} pages; the limit is ${settings.maxPdfPages}.`,
    );
  }

  const sha256 = new Bun.CryptoHasher("sha256").update(input.pdf).digest("hex");
  const existing = await findExisting(db, sha256, input.sourceRef);
  if (existing && !(input.force && existing.status === "published")) {
    return { ...existing, created: false };
  }

  if (input.createdBy) {
    const [started] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.ingestions)
      .where(
        and(
          eq(schema.ingestions.createdBy, input.createdBy),
          gte(schema.ingestions.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
        ),
      );
    if ((started?.count ?? 0) >= settings.ingestionsPerDay) {
      throw new PipelineError(
        "limit_reached",
        `You have started ${settings.ingestionsPerDay} ingestions in the last 24 hours, the daily limit.`,
      );
    }
  }

  const id = Bun.randomUUIDv7();
  await deps.storage.put(ingestionKeys(id).source, input.pdf, {
    contentType: "application/pdf",
  });
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.ingestions).values({
        id,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        pdfSha256: sha256,
        options,
        model: deps.llm.model,
        promptVersion: PROMPT_VERSION,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      });
      await enqueue(tx, id, "read");
    });
  } catch (error) {
    await deps.storage.delete(ingestionKeys(id).source);
    if (!isUniqueViolation(error)) throw error;
    // Another upload of the same file won the race.
    const winner = await findExisting(db, sha256, input.sourceRef);
    if (!winner) throw error;
    return { ...winner, created: false };
  }
  deps.logger.info("ingestion created", {
    ingestionId: id,
    sourceType: input.sourceType,
    pages,
  });
  return { id, status: "queued", created: true };
}
