import { etag, RETAINED_304_HEADERS } from "hono/etag";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * Cache policy of public content (docs/specs/05-api.md §4). Shared caches keep
 * a response for 20 s and may serve it stale while refetching. With the
 * server's 10 s index cache and the web app's 30 s revalidation, a change to
 * content reaches every page within a minute.
 */
export const PUBLIC_CONTENT_CACHE_CONTROL =
  "public, s-maxage=20, stale-while-revalidate=86400";

/**
 * For public, session-independent GET routes: sets the shared cache policy on
 * success and answers `If-None-Match` with 304. The ETag is a digest of the
 * body, so it changes exactly when the response does. Errors keep the
 * default `private, no-store`.
 */
export function publicCache() {
  // A 304 keeps the request id, so it can be traced like any other response.
  const conditional = etag({
    retainedHeaders: [...RETAINED_304_HEADERS, "x-request-id"],
  });
  const cacheControl = createMiddleware<AppEnv>(async (c, next) => {
    await next();
    if (c.res.status === 200 || c.res.status === 304) {
      c.res.headers.set("Cache-Control", PUBLIC_CONTENT_CACHE_CONTROL);
    }
  });
  return [cacheControl, conditional] as const;
}
