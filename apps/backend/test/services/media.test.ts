import { afterAll, describe, expect, test } from "bun:test";
import { FsStorage, type ObjectStorage } from "@repo/storage";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMediaUrls, MEDIA_PATH } from "../../src/services/media";

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fsStorage(): Promise<ObjectStorage> {
  const dir = await mkdtemp(join(tmpdir(), "media-"));
  dirs.push(dir);
  return new FsStorage({ root: dir });
}

const SECRET = "test-secret-test-secret-test-secret";

describe("createMediaUrls with fs storage", () => {
  test("signs a path on this API that grants exactly one key until it expires", async () => {
    let clock = Date.parse("2026-11-25T10:00:00.000Z");
    const urls = createMediaUrls({
      storage: await fsStorage(),
      secret: SECRET,
      now: () => clock,
    });
    const url = await urls.urlFor("video/a/intro.mp4", 300);
    expect(url).toStartWith(`${MEDIA_PATH}/`);
    const token = url.slice(MEDIA_PATH.length + 1);
    expect(urls.verify(token)).toBe("video/a/intro.mp4");

    clock += 299_000;
    expect(urls.verify(token)).toBe("video/a/intro.mp4");
    clock += 1_000;
    expect(urls.verify(token)).toBeNull();
  });

  test("refuses tokens that were altered or signed with another secret", async () => {
    const storage = await fsStorage();
    const urls = createMediaUrls({ storage, secret: SECRET });
    const token = (await urls.urlFor("video/a/intro.mp4", 300)).split("/").at(-1) ?? "";
    const [payload = "", signature = ""] = token.split(".");

    const otherKey = Buffer.from(
      JSON.stringify(["video/b/secret.mp4", 9_999_999_999]),
    ).toString("base64url");
    const longer = Buffer.from(
      JSON.stringify(["video/a/intro.mp4", 9_999_999_999]),
    ).toString("base64url");
    for (const forged of [
      `${otherKey}.${signature}`,
      `${longer}.${signature}`,
      `${payload}.${signature.slice(0, -2)}AA`,
      `${payload}`,
      `${payload}.${signature}.extra`,
      "",
    ]) {
      expect(urls.verify(forged)).toBeNull();
    }
    const elsewhere = createMediaUrls({ storage, secret: `${SECRET}-other` });
    expect(elsewhere.verify(token)).toBeNull();
  });
});

describe("createMediaUrls with presigning storage", () => {
  test("uses the store's own presigned URL", async () => {
    const storage = await fsStorage();
    const presigning: ObjectStorage = Object.assign(Object.create(storage), {
      presignGet: async (key: string, seconds: number) => ({
        url: `https://bucket.example/${key}?X-Amz-Expires=${seconds}`,
        expiresAt: new Date(Date.now() + seconds * 1000),
      }),
    });
    const urls = createMediaUrls({ storage: presigning, secret: SECRET });
    expect(await urls.urlFor("video/a.mp4", 300)).toBe(
      "https://bucket.example/video/a.mp4?X-Amz-Expires=300",
    );
  });
});
