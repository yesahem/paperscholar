import { AppError } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * List cursors are opaque to clients (docs/specs/05-api.md §4): the last
 * item's time and id, which together order a list without ties.
 */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString("base64url");
}

/** Reads a cursor from `encodeCursor`; anything else is a `validation_error`. */
export function decodeCursor(cursor: string): { at: Date; id: string } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string" &&
      UUID.test(value[1]) &&
      !Number.isNaN(Date.parse(value[0]))
    ) {
      return { at: new Date(value[0]), id: value[1] };
    }
  } catch {
    // Falls through to the validation error below.
  }
  throw new AppError("validation_error", {
    details: { issues: [{ path: "cursor", message: "is not a cursor from this API" }] },
  });
}
