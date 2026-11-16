import { httpOriginSchema, parseEnv } from "@repo/shared";
import { z } from "zod";

const envSchema = z.object({
  /** Where /api/* is proxied. Server-only; the browser never sees it. */
  API_ORIGIN: httpOriginSchema,
  /** The CMS's own public origin, for metadata. */
  NEXT_PUBLIC_CMS_URL: httpOriginSchema,
  /** The learner site, for links to published papers and for account links. */
  NEXT_PUBLIC_SITE_URL: httpOriginSchema,
  /**
   * Origin maintainers' browsers upload PDFs to when the backend stores files
   * in R2 (its S3 endpoint, https://<account>.r2.cloudflarestorage.com).
   * Allowed for fetch by the Content-Security-Policy. Unset with fs storage,
   * where uploads go through this site.
   */
  UPLOAD_ORIGIN: httpOriginSchema.optional(),
});

export type CmsEnv = z.output<typeof envSchema>;

/**
 * Validates the CMS's environment. Called by next.config.ts and the root
 * layout, so `next dev`, `next build` and `next start` all fail fast, naming
 * any bad variable.
 */
export function loadCmsEnv(
  source: Record<string, string | undefined> = process.env,
): CmsEnv {
  return parseEnv(envSchema, source, {
    app: "cms",
    exampleFile: "apps/cms/.env.example",
  });
}
