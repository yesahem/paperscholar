import { describe, expect, test } from "bun:test";
import { ApiError } from "@repo/web-core/api/errors";
import {
  getDashboard,
  getLatestEval,
  getTracks,
  putTracks,
  startEval,
} from "@/lib/api/cms";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function fakeApi(response: () => Response) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return response();
  };
  return { calls, fetch: fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("tracks", () => {
  const document = {
    revision: 3,
    tracks: [
      { id: "basics", title: "Basics", summary: "S.", paperIds: ["adam"], origin: "cms" },
    ],
  };

  test("reads the document", async () => {
    const api = fakeApi(() => json(document));
    expect(await getTracks({ fetch: api.fetch })).toEqual(document);
    expect(api.calls).toEqual([
      { url: "/api/v1/admin/tracks", method: "GET", body: undefined },
    ]);
  });

  test("saves with the revision the edit started from", async () => {
    const api = fakeApi(() => json({ ...document, revision: 4 }));
    const body = {
      revision: 3,
      tracks: [{ id: "basics", title: "B", summary: "S.", paperIds: ["adam"] }],
    };
    expect((await putTracks(body, { fetch: api.fetch })).revision).toBe(4);
    expect(api.calls[0]).toEqual({ url: "/api/v1/admin/tracks", method: "PUT", body });
  });

  test("a conflict arrives as an ApiError with its code", async () => {
    const api = fakeApi(() =>
      json({ error: { code: "conflict", message: "Changed.", requestId: "r1" } }, 409),
    );
    const error = await putTracks(
      { revision: 1, tracks: [] },
      { fetch: api.fetch },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "conflict" });
  });

  test("a body that breaks the contract is an error, not data", async () => {
    const api = fakeApi(() => json({ revision: "three", tracks: [] }));
    await expect(getTracks({ fetch: api.fetch })).rejects.toBeInstanceOf(ApiError);
  });
});

describe("dashboard and eval", () => {
  test("the dashboard asks for its window", async () => {
    const api = fakeApi(() => json({}));
    await getDashboard(7, { fetch: api.fetch }).catch(() => undefined);
    expect(api.calls[0]?.url).toBe("/api/v1/admin/dashboard?days=7");
  });

  test("no run reads as null, and starting sends the confirmation", async () => {
    const none = fakeApi(() => json({ run: null }));
    expect(await getLatestEval({ fetch: none.fetch })).toEqual({ run: null });

    const started = fakeApi(() => json({}, 202));
    await startEval({ fresh: true, confirmCost: true }, { fetch: started.fetch }).catch(
      () => undefined,
    );
    expect(started.calls[0]).toEqual({
      url: "/api/v1/admin/evals",
      method: "POST",
      body: { fresh: true, confirmCost: true },
    });
  });
});
