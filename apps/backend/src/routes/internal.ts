import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "../lib/errors";
import type { CleanupReport } from "../services/cleanup";
import type { AppEnv } from "../types";

function bearerMatches(header: string | undefined, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Internal endpoints for schedulers (docs/specs/05-api.md §10), guarded by
 * `INTERNAL_SECRET`. Without the secret they do not exist. GET is accepted as
 * well as POST because Vercel Cron sends GET.
 */
export function internalRoutes(
  secret: string | null,
  cleanup: () => Promise<CleanupReport>,
) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      if (secret === null) throw new AppError("not_found");
      if (!bearerMatches(c.req.header("Authorization"), secret)) {
        throw new AppError("unauthenticated");
      }
      await next();
    })
    .on(["GET", "POST"], "/cron/cleanup", async (c) => c.json(await cleanup()));
}
