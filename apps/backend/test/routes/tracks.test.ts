import { trackListSchema } from "@repo/shared";
import { afterEach, describe, expect, test } from "bun:test";
import { PUBLIC_CONTENT_CACHE_CONTROL } from "../../src/middleware/public-cache";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { createTestApp } from "../helpers";

let content: SyncedContent | null = null;
afterEach(async () => {
  await content?.cleanup();
  content = null;
});

describe("GET /api/v1/tracks", () => {
  test("lists tracks with their published papers, in track order", async () => {
    content = await syncedContent();
    const { app } = createTestApp({}, content.reader);
    const res = await app.request("/api/v1/tracks");

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
    expect(trackListSchema.parse(await res.json()).items).toEqual([
      {
        id: "fundamentals",
        title: "Fundamentals",
        summary: "Start here.",
        paperIds: ["rectifier-networks", "second-paper"],
      },
    ]);
  });

  test("drops unpublished papers and tracks left empty", async () => {
    content = await syncedContent();
    const { app } = createTestApp({}, content.reader);

    await content.writer.setPaperStatus("second-paper", "draft");
    let body = trackListSchema.parse(await (await app.request("/api/v1/tracks")).json());
    expect(body.items[0]?.paperIds).toEqual(["rectifier-networks"]);

    await content.writer.setPaperStatus("rectifier-networks", "archived");
    body = trackListSchema.parse(await (await app.request("/api/v1/tracks")).json());
    expect(body.items).toEqual([]);
  });

  test("is empty on an instance with no content", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/tracks");
    expect(trackListSchema.parse(await res.json()).items).toEqual([]);
  });
});
