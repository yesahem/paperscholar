import type { HealthResponse } from "@repo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../types";

export interface HealthRoutesOptions {
  version: string;
}

/**
 * GET /api/health. Liveness only: it touches no database or storage, so it
 * stays fast and says nothing about dependencies (docs/specs/05-api.md §10).
 */
export function healthRoutes({ version }: HealthRoutesOptions) {
  return new Hono<AppEnv>().get("/", (c) => {
    const body: HealthResponse = { ok: true, version };
    return c.json(body);
  });
}
