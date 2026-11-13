import {
  ERROR_MESSAGES,
  ERROR_STATUS,
  type ErrorCode,
  type ErrorStatus,
} from "@repo/shared";

export interface AppErrorOptions {
  /** User-safe message. Defaults to the code's standard message. */
  message?: string;
  /** Machine-readable details, as documented per code in docs/specs/05-api.md §3. */
  details?: unknown;
  /** Underlying error, kept for logs and never sent to the client. */
  cause?: unknown;
}

/**
 * An expected failure with a stable code. Services throw it; the error handler
 * turns it into the standard error envelope. Its message reaches the client,
 * so it must never contain internal detail.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;
  readonly details: unknown;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? ERROR_MESSAGES[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options.details;
  }
}
