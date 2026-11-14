import { createStorage, type ObjectStorage, type StoredObject } from "@repo/storage";
import type { AppConfig } from "../env";

/** Where the API serves avatars itself, with the `fs` driver. */
export const AVATAR_ROUTE_PREFIX = "/api/avatars";

/** Inside the storage folder, avatars live under this prefix, apart from content. */
const FS_PREFIX = "public/";

/** `avatars/<userId>/<id>.webp`. A new upload gets a new key, so URLs never go stale. */
const AVATAR_KEY = /^avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

export function avatarKey(userId: string, id: string): string {
  return `avatars/${userId}/${id}.webp`;
}

export function isAvatarKey(key: string): boolean {
  return AVATAR_KEY.test(key);
}

/**
 * Stored avatars (docs/specs/03-content.md §2.4). Objects are immutable:
 * replacing an avatar writes a new key and deletes the old one.
 */
export interface AvatarStore {
  put(key: string, body: Uint8Array): Promise<void>;
  /** Deleting a missing avatar is not an error. */
  delete(key: string): Promise<void>;
  /** Where a browser loads the avatar from. */
  url(key: string): string;
  /** The avatar's bytes, for the API to serve; null when this store has a public URL instead. */
  read: ((key: string) => Promise<StoredObject | null>) | null;
}

/** An avatar store over `storage`. Exported for tests. */
export function avatarStoreOver(
  storage: ObjectStorage,
  options: { prefix: string; publicUrl: string | null },
): AvatarStore {
  const stored = (key: string) => `${options.prefix}${key}`;
  return {
    async put(key, body) {
      await storage.put(stored(key), body, { contentType: "image/webp" });
    },
    async delete(key) {
      await storage.delete(stored(key));
    },
    url(key) {
      return options.publicUrl === null
        ? `${AVATAR_ROUTE_PREFIX}/${key.slice("avatars/".length)}`
        : `${options.publicUrl}/${key}`;
    },
    read: options.publicUrl === null ? (key) => storage.get(stored(key)) : null,
  };
}

/** The avatar store this instance is configured for. */
export function createAvatarStore(config: Pick<AppConfig, "storage" | "avatars">) {
  if (config.avatars.driver === "fs" || config.storage.driver === "fs") {
    return avatarStoreOver(createStorage(config.storage), {
      prefix: FS_PREFIX,
      publicUrl: null,
    });
  }
  return avatarStoreOver(
    createStorage({ ...config.storage, bucket: config.avatars.bucket }),
    { prefix: "", publicUrl: config.avatars.publicUrl },
  );
}
