import { ERROR_MESSAGES, type ErrorBody, type ErrorCode } from "@repo/shared";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../lib/errors";
import type { Logger } from "@repo/shared/logger";
import type { AppEnv } from "../types";

/** Codes for errors Hono raises itself, such as malformed JSON. */
const HTTP_STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: "validation_error",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "payload_too_large",
  429: "rate_limited",
  503: "upstream_unavailable",
};

function respond(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  details?: unknown,
) {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId: c.get("requestId"),
    },
  };
  return c.json(body, status);
}

/**
 * Turns every thrown error into the standard envelope (docs/specs/05-api.md §3).
 * Unexpected errors are logged in full and reported to the client generically.
 */
export function createErrorHandler(rootLogger: Logger): ErrorHandler<AppEnv> {
  return (error, c) => {
    const logger = c.get("logger") ?? rootLogger;

    if (error instanceof AppError) {
      if (error.status >= 500)
        logger.error("request failed", { code: error.code, error });
      if (error.retryAfterSeconds !== null) {
        c.header("Retry-After", String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
      }
      return respond(c, error.status, error.code, error.message, error.details);
    }

    if (error instanceof HTTPException) {
      const code = HTTP_STATUS_CODES[error.status] ?? "internal_error";
      if (code === "internal_error") logger.error("request failed", { error });
      return respond(
        c,
        code === "internal_error" ? 500 : error.status,
        code,
        ERROR_MESSAGES[code],
      );
    }

    logger.error("unhandled error", { error });
    return respond(c, 500, "internal_error", ERROR_MESSAGES.internal_error);
  };
}

/** Unknown routes return the standard `not_found` envelope. */
export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  respond(c, 404, "not_found", ERROR_MESSAGES.not_found);
