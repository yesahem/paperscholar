import {
  AVATAR_MAX_BYTES,
  avatarUploadedSchema,
  errorBodySchema,
  meSchema,
} from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { AVATAR_UPLOADS_PER_HOUR } from "../../src/services/avatars";
import { TestBrowser } from "../auth-client";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, memoryAvatarStore } from "../helpers";
import { png } from "../images";

const form = (parts: Record<string, Blob | string>) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(parts)) body.append(name, value);
  return body;
};
const image = (bytes: Uint8Array, name = "me.png", type = "image/png") =>
  new File([bytes], name, { type });

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

describe("avatar routes without a session", () => {
  test("uploading needs a session", async () => {
    const { app } = createTestApp();
    const response = await new TestBrowser(app).upload(
      "/api/v1/me/avatar",
      form({ avatar: image(png(4, 4)) }),
    );
    expect(response.status).toBe(401);
  });

  test("a malformed avatar path is refused, and a missing one is 404", async () => {
    const { app } = createTestApp();
    expect((await app.request("/api/avatars/../../etc/passwd")).status).toBe(404);
    expect((await app.request("/api/avatars/x/y.webp")).status).toBe(400);
    const missing = await app.request(
      `/api/avatars/${Bun.randomUUIDv7()}/${Bun.randomUUIDv7()}.webp`,
    );
    expect(missing.status).toBe(404);
  });
});

describe.skipIf(!DATABASE_URL)("avatars", () => {
  const database = useTestDatabase();

  async function signedIn() {
    const store = memoryAvatarStore();
    const { app } = createTestApp({}, undefined, { db: database.db, avatarStore: store });
    const browser = new TestBrowser(app);
    const username = `av${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    await browser.signUp({ email: `${username}@example.com`, username });
    return { app, browser, store, username };
  }

  const me = async (browser: TestBrowser) =>
    meSchema.parse(await (await browser.request("/api/v1/me")).json());

  test("an upload is re-encoded, stored, served for good and shown on the account", async () => {
    const { app, browser, store } = await signedIn();
    const response = await browser.upload(
      "/api/v1/me/avatar",
      form({ avatar: image(png(600, 400), "holiday.jpg", "image/jpeg") }),
    );
    expect(response.status).toBe(200);
    const { avatarUrl } = avatarUploadedSchema.parse(await response.json());
    expect(avatarUrl).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
    expect((await me(browser)).avatarUrl).toBe(avatarUrl);
    expect(store.objects.size).toBe(1);

    const served = await app.request(avatarUrl);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/webp");
    expect(served.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const { width, format } = await new Bun.Image(
      new Uint8Array(await served.arrayBuffer()),
    ).metadata();
    expect({ width, format }).toEqual({ width: 256, format: "webp" });
  });

  test("a new upload replaces the old file; removing deletes it", async () => {
    const { app, browser, store } = await signedIn();
    const first = avatarUploadedSchema.parse(
      await (
        await browser.upload("/api/v1/me/avatar", form({ avatar: image(png(8, 8)) }))
      ).json(),
    );
    const second = avatarUploadedSchema.parse(
      await (
        await browser.upload("/api/v1/me/avatar", form({ avatar: image(png(9, 9)) }))
      ).json(),
    );
    expect(second.avatarUrl).not.toBe(first.avatarUrl);
    expect((await app.request(first.avatarUrl)).status).toBe(404);
    expect(store.objects.size).toBe(1);

    const removed = await browser.request("/api/v1/me/avatar", { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect((await me(browser)).avatarUrl).toBeNull();
    expect(store.objects.size).toBe(0);
    expect(
      (await browser.request("/api/v1/me/avatar", { method: "DELETE" })).status,
    ).toBe(204);
  });

  test("anything but one image in the field avatar is refused, and nothing is stored", async () => {
    const { browser, store } = await signedIn();
    const pdf = new File(["%PDF-1.7 …"], "me.png", { type: "image/png" });
    for (const body of [
      form({ avatar: pdf }),
      form({ photo: image(png(4, 4)) }),
      form({ avatar: image(png(4, 4)), role: "admin" }),
      form({ avatar: "not a file" }),
    ]) {
      const response = await browser.upload("/api/v1/me/avatar", body);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("validation_error");
    }
    const json = await browser.request("/api/v1/me/avatar", {
      method: "POST",
      body: { avatar: "x" },
    });
    expect(json.status).toBe(400);
    expect(store.objects.size).toBe(0);
  });

  test("a file over 2 MB is refused", async () => {
    const { browser } = await signedIn();
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set(png(4, 4));
    const response = await browser.upload(
      "/api/v1/me/avatar",
      form({ avatar: image(big) }),
    );
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("payload_too_large");
  });

  test("uploads are limited per hour", async () => {
    const { browser } = await signedIn();
    for (let i = 0; i < AVATAR_UPLOADS_PER_HOUR; i += 1) {
      const response = await browser.upload(
        "/api/v1/me/avatar",
        form({ avatar: image(png(4, 4)) }),
      );
      expect(response.status).toBe(200);
    }
    const limited = await browser.upload(
      "/api/v1/me/avatar",
      form({ avatar: image(png(4, 4)) }),
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  test("deleting the account deletes its avatar file", async () => {
    const { browser, store, username } = await signedIn();
    await browser.upload("/api/v1/me/avatar", form({ avatar: image(png(4, 4)) }));
    expect(store.objects.size).toBe(1);
    const deleted = await browser.request("/api/v1/me", {
      method: "DELETE",
      body: { confirm: username },
    });
    expect(deleted.status).toBe(204);
    expect(store.objects.size).toBe(0);
  });
});
