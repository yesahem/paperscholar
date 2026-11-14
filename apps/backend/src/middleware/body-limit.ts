import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

/** Largest accepted JSON body (docs/specs/11-security-ops.md §4). */
export const MAX_JSON_BODY_BYTES = 256 * 1024;

function limit(maxBytes: number) {
  return bodyLimit({
    maxSize: maxBytes,
    onError: () => {
      throw new AppError("payload_too_large", { details: { maxBytes } });
    },
  });
}

/**
 * Rejects bodies over `maxBytes` with the standard `payload_too_large` error.
 * `uploads` raises the limit for named paths that accept a file.
 */
export function limitBody(
  maxBytes: number = MAX_JSON_BODY_BYTES,
  uploads: Record<string, number> = {},
) {
  const fallback = limit(maxBytes);
  const raised = new Map(
    Object.entries(uploads).map(([path, max]) => [path, limit(max)]),
  );
  return createMiddleware<AppEnv>((c, next) =>
    (raised.get(c.req.path) ?? fallback)(c, next),
  );
}
