import {
  errorBodySchema,
  paperDetailSchema,
  paperListSchema,
  problemDetailSchema,
} from "@repo/shared";
import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { PUBLIC_CONTENT_CACHE_CONTROL } from "../../src/middleware/public-cache";
import { catalogueLibrary, syncedContent, type SyncedContent } from "../content-fixture";
import { createTestApp } from "../helpers";

let content: SyncedContent | null = null;
afterEach(async () => {
  await content?.cleanup();
  content = null;
});

async function setup() {
  content = await syncedContent();
  return { ...createTestApp({}, content.reader), content };
}

describe("GET /api/v1/papers", () => {
  test("lists published papers by title with problem counts", async () => {
    const { app } = await setup();
    const res = await app.request("/api/v1/papers");

    expect(res.status).toBe(200);
    const body = paperListSchema.parse(await res.json());
    expect(body.items.map((paper) => [paper.id, paper.problemCount])).toEqual([
      ["rectifier-networks", 2],
      ["second-paper", 1],
    ]);
    expect(body.items[0]?.difficultyCounts).toEqual({ easy: 1, medium: 1, hard: 0 });
  });

  test("is publicly cacheable and answers a matching If-None-Match with 304", async () => {
    const { app } = await setup();
    const first = await app.request("/api/v1/papers");
    const etag = first.headers.get("ETag");

    expect(first.headers.get("Cache-Control")).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
    expect(etag).toMatch(/^"[0-9a-f]+"$/);

    const again = await app.request("/api/v1/papers", {
      headers: { "If-None-Match": etag ?? "" },
    });
    expect(again.status).toBe(304);
    expect(again.headers.get("X-Request-Id")).toBeTruthy();
    expect(again.headers.get("Cache-Control")).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
    expect(await again.text()).toBe("");
  });

  test("leaves out draft and archived papers, and changes its ETag when they change", async () => {
    const { app, content } = await setup();
    const before = (await app.request("/api/v1/papers")).headers.get("ETag");

    await content.writer.setPaperStatus("second-paper", "draft");
    const res = await app.request("/api/v1/papers");
    const body = paperListSchema.parse(await res.json());

    expect(body.items.map((paper) => paper.id)).toEqual(["rectifier-networks"]);
    expect(res.headers.get("ETag")).not.toBe(before);
  });
});

describe("GET /api/v1/papers/:paperId", () => {
  test("returns the paper with its problems in order", async () => {
    const { app } = await setup();
    const res = await app.request("/api/v1/papers/rectifier-networks");

    expect(res.status).toBe(200);
    const paper = paperDetailSchema.parse(await res.json());
    expect(paper.problems.map((p) => [p.id, p.order, p.difficulty])).toEqual([
      ["relu", 1, "easy"],
      ["clipped", 2, "medium"],
    ]);
  });

  test("an unknown or unpublished paper is a private 404", async () => {
    const { app, content } = await setup();
    await content.writer.setPaperStatus("second-paper", "archived");

    for (const path of ["/api/v1/papers/no-such-paper", "/api/v1/papers/second-paper"]) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(errorBodySchema.parse(await res.json()).error.code).toBe("not_found");
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  test("an id that is not a slug is a validation error", async () => {
    const { app } = await setup();
    const res = await app.request("/api/v1/papers/Not_A_Slug");

    expect(res.status).toBe(400);
    expect(errorBodySchema.parse(await res.json()).error.code).toBe("validation_error");
  });

  test("a retired problem is hidden and the others are renumbered", async () => {
    const { app, content } = await setup();
    const library = catalogueLibrary();
    for (const path of Object.keys(library)) {
      if (path.includes("rectifier-networks/problems/01-relu/")) delete library[path];
    }
    await content.resync(library);

    const paper = paperDetailSchema.parse(
      await (await app.request("/api/v1/papers/rectifier-networks")).json(),
    );
    expect(paper.problems.map((p) => [p.id, p.order])).toEqual([["clipped", 1]]);
    expect(paper.problemCount).toBe(1);
    expect(
      (await app.request("/api/v1/papers/rectifier-networks/problems/relu")).status,
    ).toBe(404);
  });
});

describe("GET /api/v1/papers/:paperId/problems/:problemId", () => {
  test("returns what the workspace needs, with helper signatures only", async () => {
    const { app } = await setup();
    const res = await app.request("/api/v1/papers/rectifier-networks/problems/clipped");

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
    const problem = problemDetailSchema.parse(await res.json());
    expect(problem).toMatchObject({
      id: "clipped",
      paperId: "rectifier-networks",
      order: 2,
      entryPoint: "relu",
      environment: "numpy",
      tutorial: "Start from the helper's signature.\n",
      starter: "def relu(x):\n    raise NotImplementedError\n",
      paperRefs: ["Section 2"],
    });
    expect(problem.helpersInterface).toBe(
      'def clip_below(x: np.ndarray, low: float = 0.0) -> np.ndarray:\n    """Values below `low` become `low`."""\n    ...',
    );
  });

  test("responds only with the documented fields", async () => {
    const { app } = await setup();
    const res = await app.request("/api/v1/papers/rectifier-networks/problems/relu");
    const body = z.record(z.string(), z.unknown()).parse(await res.json());

    expect(Object.keys(body).sort()).toEqual(
      Object.keys(problemDetailSchema.shape).sort(),
    );
    expect(body.helpersInterface).toBeNull();
  });

  test("an unknown problem is a 404", async () => {
    const { app } = await setup();
    const res = await app.request("/api/v1/papers/rectifier-networks/problems/nope");
    expect(res.status).toBe(404);
  });
});
