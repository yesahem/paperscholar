import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "../lib/errors";
import type { CleanupReport } from "../services/cleanup";
import type { PipelineRunner } from "../services/pipeline-runner";
import type { AppEnv } from "../types";

function bearerMatches(header: string | undefined, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface InternalHandlers {
  cleanup: () => Promise<CleanupReport>;
  /** Null when this instance has no pipeline. */
  pipeline: PipelineRunner | null;
}

/**
 * Internal endpoints for schedulers (docs/specs/05-api.md §10), guarded by
 * `INTERNAL_SECRET`. Without the secret they do not exist. GET is accepted as
 * well as POST because Vercel Cron sends GET.
 *
 * `/cron/pipeline` is the pipeline's tick (docs/specs/09-paper-pipeline.md
 * §13): the per-minute safety net, and the call each invocation makes to the
 * next while work remains. It answers at once and ticks in the background.
 */
export function internalRoutes(secret: string | null, handlers: InternalHandlers) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      if (secret === null) throw new AppError("not_found");
      if (!bearerMatches(c.req.header("Authorization"), secret)) {
        throw new AppError("unauthenticated");
      }
      await next();
    })
    .on(["GET", "POST"], "/cron/cleanup", async (c) => c.json(await handlers.cleanup()))
    .on(["GET", "POST"], "/cron/pipeline", (c) => {
      if (handlers.pipeline === null) throw new AppError("not_found");
      handlers.pipeline.kick(new URL(c.req.url).origin);
      return c.json({ started: true }, 202);
    });
}
