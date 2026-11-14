import type { NextConfig } from "next";
import { loadWebEnv } from "./lib/env";
import { securityHeaders } from "./lib/security/headers";

const env = loadWebEnv();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  /**
   * The browser only ever talks to this origin. /api/* is forwarded to the
   * backend, so the session cookie stays first-party and no CORS is needed
   * (docs/specs/01-architecture.md §4.2).
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
        headers: securityHeaders({
          development: process.env.NODE_ENV === "development",
          avatarOrigin: env.AVATAR_ORIGIN,
        }),
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
