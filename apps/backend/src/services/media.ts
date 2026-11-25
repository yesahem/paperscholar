import { timingSafeEqual } from "node:crypto";
import type { ObjectStorage } from "@repo/storage";

/** Where the API serves objects itself, for drivers that cannot presign (fs). */
export const MEDIA_PATH = "/api/media";

export interface MediaUrls {
  /**
   * A URL the browser can read `key` from for `expiresInSeconds`: the
   * store's own presigned URL, or a signed path on this API (fs).
   */
  urlFor(key: string, expiresInSeconds: number): Promise<string>;
  /** The key a token from `urlFor` grants, or null when it is forged or expired. */
  verify(token: string): string | null;
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Short-lived media URLs (docs/specs/10-secondary-features.md §5). For fs
 * storage a token is `<payload>.<signature>`, where the payload is the key
 * and its expiry and the signature is an HMAC-SHA256 under a key derived
 * from the auth secret, so it cannot be forged or extended.
 */
export function createMediaUrls({
  storage,
  secret,
  now = () => Date.now(),
}: {
  storage: ObjectStorage;
  /** The auth secret; a media-only key is derived from it. */
  secret: string;
  now?: () => number;
}): MediaUrls {
  const signingKey = new Bun.CryptoHasher("sha256", secret)
    .update("paperscholar media urls v1")
    .digest();

  function sign(payload: string): Uint8Array {
    return new Uint8Array(
      new Bun.CryptoHasher("sha256", signingKey).update(payload).digest(),
    );
  }

  return {
    async urlFor(key, expiresInSeconds) {
      const presigned = await storage.presignGet(key, expiresInSeconds);
      if (presigned) return presigned.url;
      const expires = Math.floor(now() / 1000) + expiresInSeconds;
      const payload = base64url(encoder.encode(JSON.stringify([key, expires])));
      return `${MEDIA_PATH}/${payload}.${base64url(sign(payload))}`;
    },

    verify(token) {
      const [payload, signature, extra] = token.split(".");
      if (!payload || !signature || extra !== undefined) return null;
      const expected = sign(payload);
      const given = new Uint8Array(Buffer.from(signature, "base64url"));
      if (given.byteLength !== expected.byteLength || !timingSafeEqual(given, expected)) {
        return null;
      }
      let value: unknown;
      try {
        value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        typeof value[0] !== "string" ||
        typeof value[1] !== "number"
      ) {
        return null;
      }
      return value[1] * 1000 > now() ? value[0] : null;
    },
  };
}
