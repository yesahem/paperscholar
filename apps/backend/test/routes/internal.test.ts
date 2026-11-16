import { errorBodySchema } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createDb } from "@repo/db";
import { silentLogger } from "@repo/shared/logger";
import { createPipelineDeps } from "../../src/adapters/pipeline";
import {
  createTestApp,
  TEST_PIPELINE_LIMITS,
  testConfig,
  unusedSandbox,
} from "../helpers";

const SECRET = "internal-secret-internal-secret-32";

describe("/api/internal without INTERNAL_SECRET", () => {
  test("does not exist", async () => {
    const { app } = createTestApp();
    const response = await app.request("/api/internal/cron/cleanup", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(response.status).toBe(404);
  });
});

describe.skipIf(!DATABASE_URL)("/api/internal/cron/cleanup", () => {
  const database = useTestDatabase();

  test("refuses a missing or wrong secret, and runs with the right one by GET or POST", async () => {
    const { app } = createTestApp({ internalSecret: SECRET }, undefined, {
      db: database.db,
    });
    for (const authorization of [undefined, "Bearer nope", `Bearer ${SECRET}x`, SECRET]) {
      const response = await app.request("/api/internal/cron/cleanup", {
        method: "POST",
        headers: authorization === undefined ? {} : { Authorization: authorization },
      });
      expect(response.status).toBe(401);
      expect(errorBodySchema.parse(await response.json()).error.code).toBe(
        "unauthenticated",
      );
    }
    for (const method of ["GET", "POST"]) {
      const response = await app.request("/api/internal/cron/cleanup", {
        method,
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reapedSubmissions: expect.any(Number),
      });
    }
  });
});

describe("/api/internal/cron/pipeline", () => {
  const kicks: string[] = [];
  const runner = {
    kick: (origin: string) => {
      kicks.push(origin);
    },
    runOnce: async () => ({ ran: 0, moreWork: false }),
  };

  test("does not exist on an instance without the pipeline", async () => {
    const { app } = createTestApp({ internalSecret: SECRET });
    const response = await app.request("/api/internal/cron/pipeline", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(response.status).toBe(404);
  });

  test("starts a tick in the background and answers at once", async () => {
    const config = testConfig({
      pipeline: {
        llm: { driver: "fake", model: "fake" },
        enabled: true,
        limits: TEST_PIPELINE_LIMITS,
      },
    });
    const deps = createPipelineDeps(config, {
      db: createDb({ url: config.databaseUrl, maxConnections: 1 }),
      sandbox: unusedSandbox,
      logger: silentLogger,
    });
    if (deps === null) throw new Error("the fake model should turn the pipeline on");
    const pipeline = { deps, runner };
    const { app } = createTestApp({ internalSecret: SECRET }, undefined, { pipeline });
    const refused = await app.request(
      "http://api.example.org/api/internal/cron/pipeline",
      {
        method: "POST",
      },
    );
    expect(refused.status).toBe(401);
    expect(kicks).toEqual([]);
    for (const method of ["GET", "POST"]) {
      const response = await app.request(
        "http://api.example.org/api/internal/cron/pipeline",
        {
          method,
          headers: { Authorization: `Bearer ${SECRET}` },
        },
      );
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ started: true });
    }
    expect(kicks).toEqual(["http://api.example.org", "http://api.example.org"]);
  });
});
