import { eq, schema, type Database } from "@repo/db";
import { AVATAR_MAX_BYTES, AVATAR_SIZE_PX } from "@repo/shared";
import type { Logger } from "@repo/shared/logger";
import { avatarKey, type AvatarStore } from "../adapters/avatar-store";
import { AppError } from "../lib/errors";
import type { RateLimiter } from "./rate-limiter";

/** Uploads per user per hour (docs/specs/11-security-ops.md §3). */
export const AVATAR_UPLOADS_PER_HOUR = 10;
/** Refuse images claiming more pixels than this before decoding them (a decompression bomb). */
export const AVATAR_MAX_PIXELS = 40_000_000;
const WEBP_QUALITY = 85;

export type ImageKind = "jpeg" | "png" | "webp";

/**
 * The image format from the file's first bytes, never from its name or
 * declared type (docs/specs/11-security-ops.md §4). Null for anything else.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const starts = (signature: readonly number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // "RIFF" <size> "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8))
    return "webp";
  return null;
}

function unreadable(cause?: unknown): AppError {
  return new AppError("validation_error", {
    message: "Upload a JPEG, PNG or WebP image.",
    details: {
      issues: [{ path: "avatar", message: "is not a JPEG, PNG or WebP image" }],
    },
    cause,
  });
}

/**
 * Decodes the upload and re-encodes it as WebP, at most 256 px on each side.
 * Re-encoding also drops every metadata block, such as a photo's location.
 */
export async function reencodeAvatar(bytes: Uint8Array): Promise<Uint8Array> {
  const kind = sniffImage(bytes);
  if (kind === null) throw unreadable();
  try {
    const image = new Bun.Image(bytes, { maxPixels: AVATAR_MAX_PIXELS });
    const { format } = await image.metadata();
    if (format !== kind) throw unreadable();
    return await image
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .bytes();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unreadable(error);
  }
}

export interface AvatarsDependencies {
  db: Database;
  store: AvatarStore;
  limiter: RateLimiter;
  logger: Logger;
}

/** Uploading and removing avatars (docs/specs/05-api.md §7). */
export function createAvatars({ db, store, limiter, logger }: AvatarsDependencies) {
  async function currentKey(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ avatarKey: schema.profiles.avatarKey })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1);
    return row?.avatarKey ?? null;
  }

  /** The old object is removed after the profile points at the new one. */
  async function discard(key: string | null): Promise<void> {
    if (key === null) return;
    try {
      await store.delete(key);
    } catch (error) {
      // The profile no longer points at it; an orphaned file is harmless.
      logger.warn("old avatar not deleted", { key, error });
    }
  }

  async function setKey(userId: string, key: string | null): Promise<void> {
    await db
      .insert(schema.profiles)
      .values({ userId, avatarKey: key })
      .onConflictDoUpdate({
        target: schema.profiles.userId,
        set: { avatarKey: key, updatedAt: new Date() },
      });
  }

  return {
    /** Stores `file` as the user's avatar and returns its URL. */
    async upload(userId: string, file: File): Promise<string> {
      if (file.size > AVATAR_MAX_BYTES) {
        throw new AppError("payload_too_large", {
          message: "Use an image of 2 MB or less.",
          details: { maxBytes: AVATAR_MAX_BYTES },
        });
      }
      const decision = await limiter.consume(`avatars:user:${userId}`, {
        windowSeconds: 3600,
        max: AVATAR_UPLOADS_PER_HOUR,
      });
      if (!decision.allowed) {
        const retryAfterSeconds = decision.retryAfterSeconds ?? 3600;
        throw new AppError("rate_limited", {
          message: "You have changed your avatar many times this hour. Try again later.",
          details: { retryAfterSeconds },
          retryAfterSeconds,
        });
      }

      const encoded = await reencodeAvatar(new Uint8Array(await file.arrayBuffer()));
      const previous = await currentKey(userId);
      const key = avatarKey(userId, Bun.randomUUIDv7());
      await store.put(key, encoded);
      await setKey(userId, key);
      await discard(previous);
      return store.url(key);
    },

    async remove(userId: string): Promise<void> {
      const previous = await currentKey(userId);
      if (previous === null) return;
      await setKey(userId, null);
      await discard(previous);
    },
  };
}

export type Avatars = ReturnType<typeof createAvatars>;
