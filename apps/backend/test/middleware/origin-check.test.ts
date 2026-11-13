import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { silentLogger } from "../../src/lib/logger";
import { createErrorHandler } from "../../src/middleware/error-handler";
import { originCheck } from "../../src/middleware/origin-check";
import type { AppEnv } from "../../src/types";

const app = new Hono<AppEnv>();
app.onError(createErrorHandler(silentLogger));
app.use(async (c, next) => {
  c.set("requestId", "test");
  await next();
});
app.use(originCheck("https://paperscholar.example"));
app.all("/", (c) => c.text("ok"));

describe("originCheck", () => {
  test("refuses a write from another origin", async () => {
    const response = await app.request("/", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
  });

  test("allows writes from the site and from clients that send no Origin", async () => {
    const cases: Record<string, string>[] = [
      { Origin: "https://paperscholar.example" },
      {},
    ];
    for (const headers of cases) {
      expect((await app.request("/", { method: "DELETE", headers })).status).toBe(200);
    }
  });

  test("ignores reads", async () => {
    const response = await app.request("/", {
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(200);
  });
});
