import { securityHeaders } from "@repo/web-core/security/headers";
import type { NextConfig } from "next";
import { loadCmsEnv } from "./lib/env";

const env = loadCmsEnv();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  /**
   * The browser only ever talks to this origin. /api/* is forwarded to the
   * backend, so the session cookie stays first-party and no CORS is needed
   * (docs/specs/14-cms.md §3.1).
   */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${env.API_ORIGIN}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders({
            development: process.env.NODE_ENV === "development",
            uploadOrigin: env.UPLOAD_ORIGIN,
          }),
          // The CMS is for maintainers; no search engine has a reason to index it.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Editor files are versioned by the monaco-editor package, not by file name.
        source: "/monaco/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
