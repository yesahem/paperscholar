import type { ErrorCode } from "@repo/shared";

/** The API answered with an error other than 404, or could not be reached. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null when the API could not be reached. */
    readonly status: number | null,
    /** The error code from the response envelope, when there was one. */
    readonly code: ErrorCode | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}
