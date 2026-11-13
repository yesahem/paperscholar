import { FEATURES, instanceConfigSchema, MAX_CODE_BYTES } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { PUBLIC_CONTENT_CACHE_CONTROL } from "../../src/middleware/public-cache";
import { createTestApp } from "../helpers";

describe("GET /api/v1/config", () => {
  test("describes the instance: features, limits and version", async () => {
    const { app } = createTestApp({ version: "v-test", limits: { runsPerDay: 42 } });
    const res = await app.request("/api/v1/config");

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
    const config = instanceConfigSchema.parse(await res.json());
    expect(config.limits).toEqual({ runsPerDay: 42, codeBytes: MAX_CODE_BYTES });
    expect(config.version).toBe("v-test");
  });

  test("reports every feature this build does not contain yet as off", async () => {
    const { app } = createTestApp();
    const config = instanceConfigSchema.parse(
      await (await app.request("/api/v1/config")).json(),
    );
    for (const feature of FEATURES) expect(config.features[feature]).toBe(false);
  });
});
