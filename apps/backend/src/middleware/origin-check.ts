import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects state-changing requests whose `Origin` is present and is not one of
 * this product's own: the web app, or the CMS when there is one
 * (docs/specs/06-auth.md §7). Browsers always send `Origin` on cross-site
 * requests that could carry the cookie.
 */
export function originCheck(...allowed: (string | null)[]) {
  const origins = new Set(allowed.filter((origin): origin is string => origin !== null));
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header("Origin");
      if (origin !== undefined && !origins.has(origin)) throw new AppError("forbidden");
    }
    await next();
  });
}
