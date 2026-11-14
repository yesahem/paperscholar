import {
  followingQuerySchema,
  usernameParamsSchema,
  userSearchQuerySchema,
} from "@repo/shared";
import { Hono } from "hono";
import { clientIp, type ClientIpOptions } from "../lib/client-ip";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validation";
import { requireVerified } from "../middleware/guards";
import type { Profiles } from "../services/profiles";
import type { RateLimiter } from "../services/rate-limiter";
import type { AppEnv } from "../types";
import { signedInUserId } from "./signed-in";

/** Searches per client address per minute (docs/specs/11-security-ops.md §3). */
export const USER_SEARCHES_PER_MINUTE = 30;

export interface UsersRoutesOptions {
  profiles: Profiles;
  limiter: RateLimiter;
  clientIp: ClientIpOptions;
  instanceVerifiesEmail: boolean;
}

/** Public profiles, search and follows (docs/specs/05-api.md §7). */
export function usersRoutes({
  profiles,
  limiter,
  clientIp: ipOptions,
  instanceVerifiesEmail,
}: UsersRoutesOptions) {
  return new Hono<AppEnv>()
    .get("/", validate("query", userSearchQuerySchema), async (c) => {
      const address = clientIp(c.req.raw.headers, ipOptions) ?? "unknown";
      const decision = await limiter.consume(`users-search:ip:${address}`, {
        windowSeconds: 60,
        max: USER_SEARCHES_PER_MINUTE,
      });
      if (!decision.allowed) {
        const retryAfterSeconds = decision.retryAfterSeconds ?? 60;
        throw new AppError("rate_limited", {
          details: { retryAfterSeconds },
          retryAfterSeconds,
        });
      }
      return c.json(await profiles.search(c.req.valid("query").q));
    })
    .get("/:username", validate("param", usernameParamsSchema), async (c) =>
      c.json(await profiles.get(c.req.valid("param").username, c.var.user?.id ?? null)),
    )
    .get(
      "/:username/following",
      validate("param", usernameParamsSchema),
      validate("query", followingQuerySchema),
      async (c) =>
        c.json(
          await profiles.following(c.req.valid("param").username, c.req.valid("query")),
        ),
    )
    .put(
      "/:username/follow",
      requireVerified(instanceVerifiesEmail),
      validate("param", usernameParamsSchema),
      async (c) => {
        await profiles.follow(signedInUserId(c.var.user), c.req.valid("param").username);
        return c.body(null, 204);
      },
    )
    .delete(
      "/:username/follow",
      requireVerified(instanceVerifiesEmail),
      validate("param", usernameParamsSchema),
      async (c) => {
        await profiles.unfollow(
          signedInUserId(c.var.user),
          c.req.valid("param").username,
        );
        return c.body(null, 204);
      },
    );
}
