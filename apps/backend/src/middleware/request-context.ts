import { createMiddleware } from "hono/factory";
import type { Logger } from "@repo/shared/logger";
import type { AppEnv } from "../types";

/** Attaches a request-scoped logger. Runs after the request-id middleware. */
export function requestContext(logger: Logger) {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set("logger", logger.child({ requestId: c.get("requestId") }));
    await next();
  });
}
