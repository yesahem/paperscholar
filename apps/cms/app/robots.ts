import type { MetadataRoute } from "next";

/** The CMS is not for search engines (docs/specs/14-cms.md §4). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
