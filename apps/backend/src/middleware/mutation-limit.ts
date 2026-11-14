import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import type { RateLimiter } from "../services/rate-limiter";
import type { AppEnv } from "../types";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * At most `max` writes per signed-in user per minute across /v1
 * (docs/specs/11-security-ops.md §3). Reads and signed-out requests pass.
 */
export function mutationLimit(limiter: RateLimiter, max: number) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user;
    if (user && WRITES.has(c.req.method)) {
      const decision = await limiter.consume(`mutations:user:${user.id}`, {
        windowSeconds: 60,
        max,
      });
      if (!decision.allowed) {
        const retryAfterSeconds = decision.retryAfterSeconds ?? 60;
        throw new AppError("rate_limited", {
          details: { retryAfterSeconds },
          retryAfterSeconds,
        });
      }
    }
    await next();
  });
}
