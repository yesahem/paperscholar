import { errorBodySchema } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp } from "../helpers";

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
