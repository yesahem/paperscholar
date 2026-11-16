import { FEATURES, instanceConfigSchema, MAX_CODE_BYTES } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { PUBLIC_CONTENT_CACHE_CONTROL } from "../../src/middleware/public-cache";
import { createTestApp, TEST_PIPELINE_LIMITS, testConfig } from "../helpers";

const ACCOUNT_FEATURES = new Set<string>([
  "signups",
  "emailVerification",
  "passwordReset",
  "googleSignIn",
]);

describe("GET /api/v1/config", () => {
  test("describes the instance: features, limits and version", async () => {
    const { app } = createTestApp({
      version: "v-test",
      limits: { ...testConfig().limits, runsPerDay: 42 },
    });
    const res = await app.request("/api/v1/config");

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
    const config = instanceConfigSchema.parse(await res.json());
    expect(config.limits).toEqual({ runsPerDay: 42, codeBytes: MAX_CODE_BYTES });
    expect(config.version).toBe("v-test");
  });

  test("reports features this build does not contain yet as off", async () => {
    const { app } = createTestApp();
    const { features } = instanceConfigSchema.parse(
      await (await app.request("/api/v1/config")).json(),
    );
    for (const feature of FEATURES.filter((name) => !ACCOUNT_FEATURES.has(name))) {
      expect(features[feature]).toBe(false);
    }
  });

  test("the pipeline is on when the instance has a model and has not switched it off", async () => {
    const pipeline = (enabled: boolean) =>
      createTestApp({
        pipeline: {
          llm: { driver: "anthropic", apiKey: "sk-test", model: "claude-opus-5-5" },
          enabled,
          limits: TEST_PIPELINE_LIMITS,
        },
      }).app;
    for (const enabled of [true, false]) {
      const { features } = instanceConfigSchema.parse(
        await (await pipeline(enabled).request("/api/v1/config")).json(),
      );
      expect(features.pipeline).toBe(enabled);
    }
  });

  test("a minimal instance: sign-up on, no verification, reset or Google", async () => {
    const { app } = createTestApp();
    const { features } = instanceConfigSchema.parse(
      await (await app.request("/api/v1/config")).json(),
    );
    expect(features).toMatchObject({
      signups: true,
      emailVerification: false,
      passwordReset: false,
      googleSignIn: false,
    });
  });

  test("account features follow the configuration", async () => {
    const { app } = createTestApp({
      auth: {
        ...testConfig().auth,
        signups: false,
        google: { clientId: "id", clientSecret: "secret" },
      },
      email: { driver: "log" },
    });
    const { features } = instanceConfigSchema.parse(
      await (await app.request("/api/v1/config")).json(),
    );
    expect(features).toMatchObject({
      signups: false,
      emailVerification: true,
      passwordReset: true,
      googleSignIn: true,
    });
  });
});
