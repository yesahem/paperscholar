import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import type { AppEnv } from "../types";

/**
 * One log line per request: method, matched route pattern, status and
 * duration. Never the body, query string, cookies or headers.
 */
export function requestLogger() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const started = performance.now();
    await next();
    const route = routePath(c, -1);
    const status = c.res.status;
    const fields = {
      method: c.req.method,
      route: route === "/*" ? "unmatched" : route,
      status,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
    };
    if (status >= 500) c.var.logger.error("request", fields);
    else c.var.logger.info("request", fields);
  });
}
