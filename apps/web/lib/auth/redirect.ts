/** Where people land after signing in when nothing else was asked for. */
export const DEFAULT_AFTER_SIGN_IN = "/papers";

/**
 * A `next` parameter is used only when it is a path on this site. Anything
 * else, such as `//evil.example` or `https://…`, falls back to the default,
 * so a crafted link cannot send someone elsewhere after signing in.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  try {
    const url = new URL(value, "https://site.invalid");
    if (url.origin !== "https://site.invalid") return DEFAULT_AFTER_SIGN_IN;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
}
