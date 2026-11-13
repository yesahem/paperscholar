import { createMiddleware } from "hono/factory";
import type { Auth } from "../auth/auth";
import type { AppEnv } from "../types";

/**
 * Resolves the session from the cookie and sets `user` and `session`, or null
 * for both (docs/specs/06-auth.md §6). Never rejects a request.
 *
 * A refreshed session cookie is passed on to the browser, except on publicly
 * cacheable responses, which must never carry a cookie.
 */
export function session(auth: Auth) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { headers, response } = await auth.api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    c.set("user", response?.user ?? null);
    c.set("session", response?.session ?? null);
    await next();

    const cookies = headers.getSetCookie();
    if (cookies.length === 0) return;
    if (c.res.headers.get("Cache-Control")?.startsWith("public")) return;
    for (const cookie of cookies) c.res.headers.append("Set-Cookie", cookie);
  });
}
