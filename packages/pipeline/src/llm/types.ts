import type { z } from "zod";

/**
 * The model, as the pipeline sees it (docs/specs/09-paper-pipeline.md §14).
 * The real implementation lives in the backend's adapters and is the only code
 * that imports a vendor SDK; tests and development use the scripted fake.
 */
export interface LlmClient {
  /** Model identifier recorded on every ingestion. */
  readonly model: string;
  /** Uploads a PDF once per run so every call can reference it. */
  uploadPdf(input: { bytes: Uint8Array; filename: string }): Promise<{ fileId: string }>;
  /** Removes an uploaded PDF. Removing a missing file is not an error. */
  deleteFile(fileId: string): Promise<void>;
  /** One call whose answer must satisfy `schema`. */
  generate<Schema extends z.ZodType>(
    request: LlmRequest<Schema>,
  ): Promise<LlmResult<z.output<Schema>>>;
}

/** What each call is for: selects the prompt, and lets fakes answer by purpose. */
export type LlmPurpose =
  | "read"
  | "plan"
  | "write"
  | "mutants"
  | "equivalence"
  | "solve"
  | "fidelity"
  /** A learner's outreach email from their CV (docs/specs/10-secondary-features.md §6). */
  | "cold_mail";

/**
 * A PDF the model reads: uploaded once and referenced by id (the pipeline's
 * paper, read many times), or sent inline with the one call that needs it (a
 * learner's CV, which is then not kept by the provider).
 */
export type LlmDocument = { fileId: string } | { pdf: Uint8Array };

/** How hard the model should think (§14: high for planning and writing). */
export type LlmEffort = "low" | "medium" | "high";

export interface LlmRequest<Schema extends z.ZodType> {
  purpose: LlmPurpose;
  /** The step the call is about, if any: for logs and for fakes. */
  subject: string | null;
  /**
   * The cached prefix, in order: the system prompt, then the PDF, then any
   * blocks that stay the same across a run (outline, plan). Nothing here may
   * vary between calls of one run, or the cache is lost.
   */
  system: string;
  /** The PDF, or null for calls that must not see one (V8). */
  document: LlmDocument | null;
  /** Run-stable text placed after the document and cached with it. */
  context: string[];
  /** The part that varies per call. */
  prompt: string;
  /** The answer's shape. Sent as a JSON schema and checked again on receipt. */
  schema: Schema;
  /** A name for the schema, shown to the model. */
  schemaName: string;
  effort: LlmEffort;
  /** Upper bound on output tokens for this call. */
  maxTokens: number;
  signal?: AbortSignal;
}

export interface LlmUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LlmResult<T> {
  value: T;
  usage: LlmUsage;
}

export const ZERO_USAGE: LlmUsage = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    calls: a.calls + b.calls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/**
 * Why a call failed. `retryable` errors fail the task, which the engine
 * retries with backoff; the others fail the ingestion at once.
 */
export type LlmErrorKind =
  | "rate_limited"
  | "overloaded"
  | "connection"
  | "refusal"
  | "max_tokens"
  | "invalid_output"
  | "bad_request"
  | "authentication";

const RETRYABLE: ReadonlySet<LlmErrorKind> = new Set([
  "rate_limited",
  "overloaded",
  "connection",
  "refusal",
  "max_tokens",
  "invalid_output",
]);

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly retryable: boolean;
  /** Tokens spent on the failed call, still counted against the ingestion. */
  readonly usage: LlmUsage;

  constructor(
    kind: LlmErrorKind,
    message: string,
    options: { usage?: LlmUsage; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "LlmError";
    this.kind = kind;
    this.retryable = RETRYABLE.has(kind);
    this.usage = options.usage ?? ZERO_USAGE;
  }
}
