import { bodyLimit } from "hono/body-limit";
import { AppError } from "../lib/errors";

/** Largest accepted JSON body (docs/specs/11-security-ops.md §4). */
export const MAX_JSON_BODY_BYTES = 256 * 1024;

/** Rejects bodies over `maxBytes` with the standard `payload_too_large` error. */
export function limitBody(maxBytes: number = MAX_JSON_BODY_BYTES) {
  return bodyLimit({
    maxSize: maxBytes,
    onError: () => {
      throw new AppError("payload_too_large", { details: { maxBytes } });
    },
  });
}
