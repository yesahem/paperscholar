import { getIPFromHeader } from "@better-auth/core/utils/ip";

export interface ClientIpOptions {
  /** The header carrying the client's address (`CLIENT_IP_HEADER`). */
  header: string;
  /** Proxies allowed to append to it (`TRUSTED_PROXIES`). */
  trustedProxies: string[];
}

/**
 * The client's address, read exactly as Better Auth reads it for the sign-in
 * limits, so every per-address limit agrees on who the client is
 * (docs/specs/11-security-ops.md §3). Null when no trustworthy address is
 * present; callers then count the request in one shared bucket.
 */
export function clientIp(headers: Headers, options: ClientIpOptions): string | null {
  const value = headers.get(options.header);
  if (value === null) return null;
  return getIPFromHeader(value, { trustedProxies: options.trustedProxies });
}
