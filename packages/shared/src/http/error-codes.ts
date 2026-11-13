import { z } from "zod";

/**
 * Every machine-readable error code the API can return.
 * Contract: docs/specs/05-api.md §3.
 */
export const ERROR_CODES = [
  "validation_error",
  "unauthenticated",
  "forbidden",
  "email_not_verified",
  "not_found",
  "conflict",
  "submission_in_progress",
  "payload_too_large",
  "rate_limited",
  "quota_exceeded",
  "internal_error",
  "upstream_unavailable",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** HTTP status sent with each error code. */
export const ERROR_STATUS = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  email_not_verified: 403,
  not_found: 404,
  conflict: 409,
  submission_in_progress: 409,
  payload_too_large: 413,
  rate_limited: 429,
  quota_exceeded: 429,
  internal_error: 500,
  upstream_unavailable: 503,
} as const satisfies Record<ErrorCode, number>;

export type ErrorStatus = (typeof ERROR_STATUS)[ErrorCode];

/** Default user-safe message for each error code. */
export const ERROR_MESSAGES = {
  validation_error: "The request is invalid.",
  unauthenticated: "You need to sign in.",
  forbidden: "You are not allowed to do that.",
  email_not_verified: "Verify your email address first.",
  not_found: "Not found.",
  conflict: "That conflicts with the current state.",
  submission_in_progress: "Another run is already in progress.",
  payload_too_large: "The request is too large.",
  rate_limited: "Too many requests. Try again shortly.",
  quota_exceeded: "You have reached your limit for now.",
  internal_error: "Something went wrong on our side.",
  upstream_unavailable: "A service we depend on is unavailable. Try again shortly.",
} as const satisfies Record<ErrorCode, string>;
