import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { fetchJson, type FetchLike } from "@/lib/api/fetch-json";

const schema = z.object({ items: z.array(z.string()) });

const respond =
  (status: number, body: unknown): FetchLike =>
  async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

describe("fetchJson", () => {
  test("returns the validated body", async () => {
    const data = await fetchJson("http://api/x", schema, {
      fetch: respond(200, { items: ["a"], extra: true }),
    });
    expect(data).toEqual({ items: ["a"] });
  });

  test("returns null on 404", async () => {
    const data = await fetchJson("http://api/x", schema, {
      fetch: respond(404, {
        error: { code: "not_found", message: "Not found.", requestId: "r" },
      }),
    });
    expect(data).toBeNull();
  });

  test("throws ApiError with the envelope's code on other errors", async () => {
    const error = await fetchJson("http://api/x", schema, {
      fetch: respond(503, {
        error: { code: "upstream_unavailable", message: "Down.", requestId: "r" },
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error instanceof ApiError ? [error.status, error.code] : null).toEqual([
      503,
      "upstream_unavailable",
    ]);
  });

  test("throws when the body breaks the contract", async () => {
    await expect(
      fetchJson("http://api/x", schema, { fetch: respond(200, { items: [1] }) }),
    ).rejects.toThrow(/does not match its contract/);
  });

  test("throws ApiError without a status when the API is unreachable", async () => {
    const error = await fetchJson("http://api/x", schema, {
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    }).catch((caught: unknown) => caught);
    expect(error instanceof ApiError ? error.status : "not an ApiError").toBeNull();
  });
});
