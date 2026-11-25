import { afterAll, describe, expect, test } from "bun:test";
import { errorBodySchema } from "@repo/shared";
import { FsStorage } from "@repo/storage";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRange } from "../../src/routes/media";
import { createMediaUrls } from "../../src/services/media";
import { createTestApp, TEST_AUTH_SECRET, testConfig } from "../helpers";

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "media-route-"));
  dirs.push(dir);
  const storage = new FsStorage({ root: dir });
  await storage.put("video/a/clip.mp4", new TextEncoder().encode("0123456789"));
  const { app } = createTestApp(testConfig({ storage: { driver: "fs", root: dir } }));
  const urls = createMediaUrls({ storage, secret: TEST_AUTH_SECRET });
  return { app, storage, urls };
}

describe("parseRange", () => {
  test("reads the three forms of one byte range", () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange("bytes=2-4", 10)).toEqual({ start: 2, end: 4 });
    expect(parseRange("bytes=7-", 10)).toEqual({ start: 7, end: null });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: null });
    expect(parseRange("bytes=-30", 10)).toEqual({ start: 0, end: null });
  });

  test("ignores what it cannot serve, so the whole file is sent", () => {
    for (const header of [
      "bytes=4-2",
      "bytes=0-1,4-5",
      "items=0-1",
      "bytes=-",
      "bytes=-0",
    ]) {
      expect(parseRange(header, 10)).toBeUndefined();
    }
  });
});

describe("GET /api/media/:token", () => {
  test("serves the whole file, or a range for seeking", async () => {
    const { app, urls } = await setup();
    const url = await urls.urlFor("video/a/clip.mp4", 300);

    const whole = await app.request(url);
    expect(whole.status).toBe(200);
    expect(await whole.text()).toBe("0123456789");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(whole.headers.get("content-type")).toBe("video/mp4");
    expect(whole.headers.get("cache-control")).toBe("private, max-age=300");

    const part = await app.request(url, { headers: { Range: "bytes=3-5" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 3-5/10");
    expect(part.headers.get("content-length")).toBe("3");
    expect(await part.text()).toBe("345");

    const tail = await app.request(url, { headers: { Range: "bytes=-2" } });
    expect(await tail.text()).toBe("89");
  });

  test("an expired or forged link is refused", async () => {
    const { app, storage } = await setup();
    const past = createMediaUrls({
      storage,
      secret: TEST_AUTH_SECRET,
      now: () => Date.now() - 301_000,
    });
    const expired = await app.request(await past.urlFor("video/a/clip.mp4", 300));
    expect(expired.status).toBe(403);
    expect(errorBodySchema.parse(await expired.json()).error.code).toBe("forbidden");

    const forged = createMediaUrls({
      storage,
      secret: "another-secret-another-secret-xx",
    });
    expect((await app.request(await forged.urlFor("video/a/clip.mp4", 300))).status).toBe(
      403,
    );
  });

  test("a range past the end is 416; a missing file is 404", async () => {
    const { app, urls } = await setup();
    const beyond = await app.request(await urls.urlFor("video/a/clip.mp4", 300), {
      headers: { Range: "bytes=10-" },
    });
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get("content-range")).toBe("bytes */10");
    expect(errorBodySchema.parse(await beyond.json()).error.code).toBe(
      "range_not_satisfiable",
    );

    const missing = await app.request(await urls.urlFor("video/a/missing.mp4", 300));
    expect(missing.status).toBe(404);
  });
});
