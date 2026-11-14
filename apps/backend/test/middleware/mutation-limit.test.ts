import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createErrorHandler } from "../../src/middleware/error-handler";
import { mutationLimit } from "../../src/middleware/mutation-limit";
import type { RateLimiter } from "../../src/services/rate-limiter";
import type { AppEnv } from "../../src/types";
import { silentLogger } from "@repo/shared/logger";
import type { AuthUser } from "../../src/auth/auth";

function app(user: AuthUser | null, limiter: RateLimiter) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set("requestId", "r");
      c.set("user", user);
      await next();
    })
    .use(mutationLimit(limiter, 1))
    .on(["GET", "POST"], "/", (c) => c.text("ok"))
    .onError(createErrorHandler(silentLogger));
}

describe("mutationLimit", () => {
  const user = { id: "u1" } as AuthUser;

  test("counts writes per user and refuses past the limit with Retry-After", async () => {
    const keys: string[] = [];
    let count = 0;
    const limiter: RateLimiter = {
      consume: async (key, rule) => {
        keys.push(key);
        count += 1;
        return count <= rule.max
          ? { allowed: true, retryAfterSeconds: null }
          : { allowed: false, retryAfterSeconds: 42 };
      },
    };
    const server = app(user, limiter);
    expect((await server.request("/", { method: "POST" })).status).toBe(200);
    const refused = await server.request("/", { method: "POST" });
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("42");
    expect(keys).toEqual(["mutations:user:u1", "mutations:user:u1"]);
  });

  test("reads and signed-out requests are not counted", async () => {
    let calls = 0;
    const limiter: RateLimiter = {
      consume: async () => {
        calls += 1;
        return { allowed: false, retryAfterSeconds: 1 };
      },
    };
    expect((await app(user, limiter).request("/")).status).toBe(200);
    expect((await app(null, limiter).request("/", { method: "POST" })).status).toBe(200);
    expect(calls).toBe(0);
  });
});
