/**
 * A `next` parameter is used only when it is a path on this site. Anything
 * else, such as `//evil.example` or `https://…`, falls back to `fallback`, so a
 * crafted link cannot send someone elsewhere after signing in.
 */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }
  try {
    const url = new URL(value, "https://site.invalid");
    if (url.origin !== "https://site.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
