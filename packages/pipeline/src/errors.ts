/**
 * Errors the pipeline raises to its callers. `code` lets the HTTP layer and the
 * commands choose a status or exit code; `message` is written for maintainers.
 */
export type PipelineErrorCode =
  | "invalid_pdf"
  | "too_large"
  | "too_many_pages"
  | "limit_reached"
  | "conflict"
  | "not_found"
  | "invalid_state";

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;

  constructor(code: PipelineErrorCode, message: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}

/**
 * A task failure that retrying cannot fix, such as a spent token budget or a
 * paper the model judged unsuitable. The ingestion fails at once.
 */
export class PermanentTaskError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PermanentTaskError";
  }
}
