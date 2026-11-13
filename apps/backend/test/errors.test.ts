import { errorBodySchema } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { AppError } from "../src/lib/errors";
import { validate } from "../src/lib/validation";
import { createTestApp } from "./helpers";

const echoSchema = z.strictObject({ name: z.string().min(1) });

/** A test app with a validated JSON echo route at POST /api/test/echo. */
function createEchoApp() {
  const { app, logs } = createTestApp();
  app.post("/api/test/echo", validate("json", echoSchema), (c) =>
    c.json(c.req.valid("json")),
  );
  return { app, logs };
}

const postJson = (body: string) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});

async function readError(res: Response) {
  return errorBodySchema.parse(await res.json()).error;
}

describe("error envelope", () => {
  test("an unknown route returns not_found with the request id", async () => {
    const { app, logs } = createTestApp();
    const res = await app.request("/api/v1/does-not-exist");
    const error = await readError(res);

    expect(res.status).toBe(404);
    expect(error.code).toBe("not_found");
    expect(error.requestId).toBe(res.headers.get("X-Request-Id") ?? "");
    expect(logs.find((log) => log.entry.msg === "request")?.entry.route).toBe(
      "unmatched",
    );
  });

  test("paths outside /api are not found too", async () => {
    const { app } = createTestApp();
    const res = await app.request("/");
    expect(res.status).toBe(404);
    expect((await readError(res)).code).toBe("not_found");
  });

  test("an AppError keeps its code, status, message and details", async () => {
    const { app } = createTestApp();
    app.get("/api/test/conflict", () => {
      throw new AppError("conflict", {
        message: "That username is taken.",
        details: { field: "username" },
      });
    });

    const res = await app.request("/api/test/conflict");
    const error = await readError(res);

    expect(res.status).toBe(409);
    expect(error).toMatchObject({
      code: "conflict",
      message: "That username is taken.",
      details: { field: "username" },
    });
  });

  test("an unexpected error becomes a generic internal_error and is logged", async () => {
    const { app, logs } = createTestApp();
    app.get("/api/test/crash", () => {
      throw new Error("database password is hunter2");
    });

    const res = await app.request("/api/test/crash");
    const error = await readError(res);

    expect(res.status).toBe(500);
    expect(error.code).toBe("internal_error");
    expect(JSON.stringify(error)).not.toContain("hunter2");
    const logged = logs.find((log) => log.entry.msg === "unhandled error");
    expect(logged?.level).toBe("error");
    expect(JSON.stringify(logged?.entry)).toContain("hunter2");
  });

  test("Hono's own HTTP errors are mapped to error codes", async () => {
    const { app } = createTestApp();
    app.get("/api/test/unauthorized", () => {
      throw new HTTPException(401);
    });

    const res = await app.request("/api/test/unauthorized");
    expect(res.status).toBe(401);
    expect((await readError(res)).code).toBe("unauthenticated");
  });

  test("malformed JSON is a validation_error", async () => {
    const { app } = createEchoApp();
    const res = await app.request("/api/test/echo", postJson("{not json"));
    expect(res.status).toBe(400);
    expect((await readError(res)).code).toBe("validation_error");
  });

  test("invalid input lists every issue, including unknown fields", async () => {
    const { app } = createEchoApp();
    const res = await app.request(
      "/api/test/echo",
      postJson(JSON.stringify({ name: "", extra: true })),
    );
    const error = await readError(res);

    expect(res.status).toBe(400);
    expect(error.code).toBe("validation_error");
    const issues = (error.details as { issues: { path: string }[] }).issues;
    expect(issues.map((issue) => issue.path).sort()).toEqual(["", "name"]);
  });

  test("valid input reaches the handler typed and parsed", async () => {
    const { app } = createEchoApp();
    const res = await app.request(
      "/api/test/echo",
      postJson(JSON.stringify({ name: "Ada" })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Ada" });
  });

  test("a body over 256 KB is rejected with payload_too_large", async () => {
    const { app } = createEchoApp();
    const res = await app.request(
      "/api/test/echo",
      postJson(JSON.stringify({ name: "x".repeat(300 * 1024) })),
    );
    const error = await readError(res);

    expect(res.status).toBe(413);
    expect(error.code).toBe("payload_too_large");
    expect(error.details).toEqual({ maxBytes: 256 * 1024 });
  });
});

describe("request ids", () => {
  test("a valid incoming X-Request-Id is reused", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/health", {
      headers: { "X-Request-Id": "from-the-proxy-123" },
    });
    expect(res.headers.get("X-Request-Id")).toBe("from-the-proxy-123");
  });

  test("each request otherwise gets a fresh id", async () => {
    const { app } = createTestApp();
    const first = await app.request("/api/health");
    const second = await app.request("/api/health");
    expect(first.headers.get("X-Request-Id")).not.toBe(
      second.headers.get("X-Request-Id"),
    );
  });
});
