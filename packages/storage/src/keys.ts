import { InvalidKeyError } from "./errors";

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const MAX_KEY_LENGTH = 512;

/**
 * Accepts only relative keys made of simple segments: letters, digits and
 * `. _ - @`, each segment starting with a letter or digit. This rules out
 * `..`, absolute paths, backslashes and empty segments, so a key can never
 * address anything outside the storage root.
 */
export function assertValidKey(key: string): void {
  if (key.length === 0) throw new InvalidKeyError(key, "is empty");
  if (key.length > MAX_KEY_LENGTH) {
    throw new InvalidKeyError(key, `is longer than ${MAX_KEY_LENGTH} characters`);
  }
  for (const segment of key.split("/")) {
    if (!SEGMENT.test(segment)) {
      throw new InvalidKeyError(key, `has an invalid segment ${JSON.stringify(segment)}`);
    }
  }
}

/** Prefixes may be empty or end with `/`; otherwise they follow key rules. */
export function assertValidPrefix(prefix: string): void {
  if (prefix === "") return;
  assertValidKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
}

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  md: "text/markdown; charset=utf-8",
  py: "text/x-python; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
};

/** Content type from a key's extension, for drivers that do not store one. */
export function contentTypeForKey(key: string): string | null {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? null;
}
