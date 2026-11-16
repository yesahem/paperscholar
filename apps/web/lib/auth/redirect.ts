import { safeNextPath as safePath } from "@repo/web-core/auth/redirect";

/** Where people land after signing in when nothing else was asked for. */
export const DEFAULT_AFTER_SIGN_IN = "/papers";

/** A `next` parameter if it is a path on this site, else the default (see `@repo/web-core/auth/redirect`). */
export function safeNextPath(value: string | null | undefined): string {
  return safePath(value, DEFAULT_AFTER_SIGN_IN);
}
