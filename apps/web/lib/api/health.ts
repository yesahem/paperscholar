import { healthResponseSchema, type HealthResponse } from "@repo/shared";

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
