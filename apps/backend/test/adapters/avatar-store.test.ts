import { FsStorage } from "@repo/storage";
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  avatarKey,
  avatarStoreOver,
  createAvatarStore,
  isAvatarKey,
} from "../../src/adapters/avatar-store";

const USER = "0190aaaa-0000-7000-8000-000000000001";
const ID = "0190aaaa-0000-7000-8000-000000000002";

describe("avatar keys", () => {
  test("are avatars/<user>/<id>.webp and nothing else", () => {
    expect(avatarKey(USER, ID)).toBe(`avatars/${USER}/${ID}.webp`);
    expect(isAvatarKey(avatarKey(USER, ID))).toBe(true);
    expect(isAvatarKey(`content/${USER}/${ID}.webp`)).toBe(false);
    expect(isAvatarKey(`avatars/${USER}/../index.json`)).toBe(false);
  });
});

describe("avatar stores", () => {
  test("with fs, files sit under public/ and the API serves them", async () => {
    const root = await mkdtemp(join(tmpdir(), "avatars-"));
    try {
      const store = createAvatarStore({
        storage: { driver: "fs", root },
        avatars: { driver: "fs" },
      });
      const key = avatarKey(USER, ID);
      await store.put(key, new Uint8Array([1, 2, 3]));
      expect(store.url(key)).toBe(`/api/avatars/${USER}/${ID}.webp`);
      expect(await Bun.file(join(root, "public", key)).exists()).toBe(true);
      expect((await store.read?.(key))?.body).toEqual(new Uint8Array([1, 2, 3]));
      await store.delete(key);
      expect(await store.read?.(key)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("with a public bucket, browsers load avatars from its URL and the API serves none", () => {
    const store = avatarStoreOver(new FsStorage({ root: "/nonexistent" }), {
      prefix: "",
      publicUrl: "https://avatars.example.com",
    });
    expect(store.url(avatarKey(USER, ID))).toBe(
      `https://avatars.example.com/avatars/${USER}/${ID}.webp`,
    );
    expect(store.read).toBeNull();
  });
});
