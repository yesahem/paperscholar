import { healthResponseSchema } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { createTestApp } from "../helpers";

describe("GET /api/health", () => {
  test("reports liveness and the deployed version", async () => {
    const { app } = createTestApp({ version: "abc123" });
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(await res.json())).toEqual({
      ok: true,
      version: "abc123",
    });
  });

  test("is uncacheable, carries a request id and security headers", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/health");

    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("logs one line with the route pattern and status", async () => {
    const { app, logs } = createTestApp();
    const res = await app.request("/api/health");
    const requestLines = logs.filter((log) => log.entry.msg === "request");

    expect(requestLines).toHaveLength(1);
    expect(requestLines[0]?.entry).toMatchObject({
      method: "GET",
      route: "/api/health",
      status: 200,
      requestId: res.headers.get("X-Request-Id"),
    });
  });
});
