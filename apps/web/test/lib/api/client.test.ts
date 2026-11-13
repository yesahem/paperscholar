import { describe, expect, test } from "bun:test";
import * as z from "zod/mini";
import { apiRequest, type FetchLike } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

const schema = z.object({ ok: z.boolean() });
const respond =
  (response: Response): FetchLike =>
  async () =>
    response;

describe("apiRequest", () => {
  test("validates a successful response", async () => {
    expect(
      await apiRequest("/v1/x", schema, { fetch: respond(Response.json({ ok: true })) }),
    ).toEqual({ ok: true });
  });

  test("204 with a null schema resolves to nothing", async () => {
    expect(
      await apiRequest("/v1/x", null, {
        method: "DELETE",
        fetch: respond(new Response(null, { status: 204 })),
      }),
    ).toBeUndefined();
  });

  test("an error envelope becomes an ApiError with its code, message and details", async () => {
    const body = {
      error: {
        code: "conflict",
        message: "That username is taken.",
        details: { availableAt: "2026-12-01T00:00:00.000Z" },
        requestId: "r1",
      },
    };
    const error = await apiRequest("/v1/me", schema, {
      fetch: respond(Response.json(body, { status: 409 })),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) return;
    expect([error.status, error.code, error.message]).toEqual([
      409,
      "conflict",
      "That username is taken.",
    ]);
    expect(error.details).toEqual(body.error.details);
  });

  test("a body that breaks the contract is an error, not data", async () => {
    const error = await apiRequest("/v1/x", schema, {
      fetch: respond(Response.json({ ok: "yes" })),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
  });

  test("sends JSON with the same-origin cookie", async () => {
    let seen: RequestInit | undefined;
    await apiRequest("/v1/me", null, {
      method: "PATCH",
      body: { bio: "hi" },
      fetch: async (_url, init) => {
        seen = init;
        return new Response(null, { status: 204 });
      },
    });
    expect(seen?.credentials).toBe("same-origin");
    expect(new Headers(seen?.headers).get("Content-Type")).toBe("application/json");
  });
});
