import type { MetadataRoute } from "next";
import { loadWebEnv } from "@/lib/env";

/** Per-user pages are never indexed (docs/specs/08-web.md §9). */
export default function robots(): MetadataRoute.Robots {
  const { NEXT_PUBLIC_SITE_URL } = loadWebEnv();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/settings", "/profile", "/cold-mail", "/interview"],
    },
    sitemap: `${NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
