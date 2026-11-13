import type { NextConfig } from "next";
import { loadWebEnv } from "./lib/env";

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
};

export default nextConfig;
