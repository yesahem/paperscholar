import { z } from "zod";

/** Response of `GET /api/health`. Contract: docs/specs/05-api.md §10. */
export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
