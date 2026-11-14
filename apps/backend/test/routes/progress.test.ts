import { errorBodySchema } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { createTestApp } from "../helpers";

// Listing solves after a real submit is covered in leaderboard.test.ts.
describe("GET /api/v1/progress", () => {
  test("needs a session", async () => {
    const { app } = createTestApp();
    const response = await app.request("/api/v1/progress");
    expect(response.status).toBe(401);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe(
      "unauthenticated",
    );
  });
});
