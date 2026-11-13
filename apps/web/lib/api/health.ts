import type { HealthResponse } from "@repo/shared";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";

/** Mirrors `healthResponseSchema` in @repo/shared; the annotation keeps them in step. */
const healthResponseSchema: z.ZodMiniType<HealthResponse> = z.object({
  ok: z.literal(true),
  version: z.string(),
});

/**
 * GET /api/health through the same-origin proxy. Throws when the backend is
 * unreachable or answers with anything but a valid health response.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/api/health", { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}`);
  }
  return healthResponseSchema.parse(await response.json());
}
