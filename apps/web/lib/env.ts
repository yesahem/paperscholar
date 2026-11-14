import { httpOriginSchema, parseEnv } from "@repo/shared";
import { z } from "zod";

const envSchema = z.object({
  /** Where /api/* is proxied. Server-only; the browser never sees it. */
  API_ORIGIN: httpOriginSchema,
  /** Canonical public URL of this site, for metadata and absolute links. */
  NEXT_PUBLIC_SITE_URL: httpOriginSchema,
  /**
   * Origin of the public bucket avatars are served from, when the backend
   * stores them in R2 (its R2_PUBLIC_URL). Allowed as an image source by the
   * Content-Security-Policy. Unset when avatars come from this site.
   */
  AVATAR_ORIGIN: httpOriginSchema.optional(),
});

export type WebEnv = z.output<typeof envSchema>;

/**
 * Validates the web app's environment. Called by next.config.ts, so `next dev`,
 * `next build` and `next start` all fail fast, naming any bad variable.
 */
export function loadWebEnv(
  source: Record<string, string | undefined> = process.env,
): WebEnv {
  return parseEnv(envSchema, source, {
    app: "web",
    exampleFile: "apps/web/.env.example",
  });
}
