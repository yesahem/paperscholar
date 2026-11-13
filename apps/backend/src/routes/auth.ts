import { Hono } from "hono";
import type { Auth } from "../auth/auth";
import { originCheck } from "../middleware/origin-check";
import type { AppEnv } from "../types";

/**
 * Better Auth's own routes under /api/auth (docs/specs/05-api.md §1).
 *
 * Better Auth checks `Origin` only when a cookie is present; `originCheck()`
 * also refuses cross-site sign-ups and sign-ins (docs/specs/06-auth.md §7).
 * Its responses are copied so they carry this request's `X-Request-Id`, and
 * its 429s gain the standard `Retry-After` header (docs/specs/05-api.md §3).
 */
export function authRoutes(auth: Auth, webOrigin: string) {
  return new Hono<AppEnv>()
    .use(originCheck(webOrigin))
    .on(["GET", "POST"], "/*", async (c) => {
      const response = await auth.handler(c.req.raw);
      const headers = new Headers(response.headers);
      headers.set("X-Request-Id", c.var.requestId);
      const retryAfter = headers.get("X-Retry-After");
      if (response.status === 429 && retryAfter !== null && !headers.has("Retry-After")) {
        headers.set("Retry-After", retryAfter);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
}
