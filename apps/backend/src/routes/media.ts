import type { ByteRange, ObjectStorage } from "@repo/storage";
import { RangeNotSatisfiableError } from "@repo/storage";
import { Hono } from "hono";
import { AppError } from "../lib/errors";
import type { MediaUrls } from "../services/media";
import type { AppEnv } from "../types";

/**
 * Reads one `Range` header: `bytes=a-b`, `bytes=a-` or `bytes=-n` (the last n
 * bytes; needs the size). Null when absent; undefined when it cannot be
 * served, which a server may answer with the whole object (RFC 9110 §14.2).
 */
export function parseRange(header: string | undefined, totalSize: number | null) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return undefined;
  if (first === "") {
    if (totalSize === null) return undefined;
    const suffix = Number(last);
    if (suffix === 0) return undefined;
    return { start: Math.max(0, totalSize - suffix), end: null } satisfies ByteRange;
  }
  const start = Number(first);
  const end = last === "" ? null : Number(last);
  if (end !== null && end < start) return undefined;
  return { start, end } satisfies ByteRange;
}

/**
 * `GET /api/media/:token`: serves a lecture video when storage cannot presign
 * (fs), with byte ranges so the player can seek. The token names one object
 * and expires (docs/specs/10-secondary-features.md §5); no session is needed,
 * as with a presigned URL.
 */
export function mediaRoutes(urls: MediaUrls, storage: ObjectStorage) {
  return new Hono<AppEnv>().get("/:token", async (c) => {
    const key = urls.verify(c.req.param("token"));
    if (!key) {
      throw new AppError("forbidden", {
        message: "This video link has expired. Reload the page to get a new one.",
      });
    }
    const header = c.req.header("range");
    const head = header?.includes("bytes=-") ? await storage.head(key) : null;
    const range = parseRange(header, head?.size ?? null) ?? null;

    let part;
    try {
      part = await storage.getRange(key, range);
    } catch (error) {
      if (error instanceof RangeNotSatisfiableError) {
        c.header("Content-Range", `bytes */${error.totalSize}`);
        throw new AppError("range_not_satisfiable", { cause: error });
      }
      throw error;
    }
    if (!part) throw new AppError("not_found");

    const partial = range !== null;
    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Content-Length": String(part.totalSize === 0 ? 0 : part.end - part.start + 1),
      "Content-Type": part.contentType ?? "application/octet-stream",
      // Each token is short-lived and personal: never kept by shared caches.
      "Cache-Control": "private, max-age=300",
      ETag: part.etag,
    };
    if (partial)
      headers["Content-Range"] = `bytes ${part.start}-${part.end}/${part.totalSize}`;
    return new Response(part.body, { status: partial ? 206 : 200, headers });
  });
}
