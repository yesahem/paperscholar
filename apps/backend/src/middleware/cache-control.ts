import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * Responses are private and uncacheable unless a route sets its own policy.
 * Public content routes opt in to caching explicitly (docs/specs/05-api.md §4).
 */
export function defaultCacheControl() {
  return createMiddleware<AppEnv>(async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", "private, no-store");
    }
  });
}
