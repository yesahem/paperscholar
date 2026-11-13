import type { ErrorCode } from "@repo/shared";

export interface ApiErrorOptions {
  cause?: unknown;
  /** Seconds to wait before retrying, from `Retry-After` on a 429. */
  retryAfterSeconds?: number | null;
  /** The `details` of the error envelope (docs/specs/05-api.md §3). */
  details?: unknown;
}

/** The API answered with an error other than 404, or could not be reached. */
export class ApiError extends Error {
  readonly retryAfterSeconds: number | null;
  readonly details: unknown;

  constructor(
    message: string,
    /** HTTP status, or null when the API could not be reached. */
    readonly status: number | null,
    /** The error code from the response envelope, when there was one. */
    readonly code: ErrorCode | null = null,
    options: ApiErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.details = options.details;
  }
}

/** `Retry-After` in seconds, when it is a positive number. */
export function retryAfterSeconds(response: Response): number | null {
  const value = Number(response.headers.get("Retry-After"));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}
