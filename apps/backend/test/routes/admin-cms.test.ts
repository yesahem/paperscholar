import { describe, expect, test } from "bun:test";
import { eq, schema } from "@repo/db";
import {
  adminTracksSchema,
  dashboardSchema,
  errorBodySchema,
  latestEvalSchema,
  trackListSchema,
} from "@repo/shared";
import { afterEach } from "bun:test";
import { TestBrowser } from "../auth-client";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, testConfig } from "../helpers";

let content: SyncedContent | null = null;
afterEach(async () => {
  await content?.cleanup();
  content = null;
});

describe("the CMS endpoints on an instance without the pipeline", () => {
  test("evals are not found; the dashboard and tracks need a signed-in maintainer", async () => {
    const { app } = createTestApp();
    for (const path of [
      "/api/v1/admin/evals/latest",
      "/api/v1/admin/dashboard",
      "/api/v1/admin/tracks",
    ]) {
      expect((await app.request(path)).status).toBe(404);
    }
  });
});

describe.skipIf(!DATABASE_URL)("the CMS endpoints", () => {
  const database = useTestDatabase();

  async function setup(role: "user" | "maintainer" | "admin" = "maintainer") {
    content = await syncedContent();
    const { app } = createTestApp(
      testConfig({ storage: { driver: "fs", root: content.dir } }),
      content.reader,
      { db: database.db },
    );
    const browser = new TestBrowser(app);
    const username = `ad${role.slice(0, 2)}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    await browser.signUp({ email: `${username}@example.com`, username });
    await database.db
      .update(schema.user)
      .set({ role })
      .where(eq(schema.user.username, username));
    return { app, browser, content };
  }

  describe("tracks", () => {
    test("a learner cannot see that they exist", async () => {
      const { browser } = await setup("user");
      expect((await browser.request("/api/v1/admin/tracks")).status).toBe(404);
      const put = await browser.request("/api/v1/admin/tracks", {
        method: "PUT",
        body: { revision: 1, tracks: [] },
      });
      expect(put.status).toBe(404);
    });

    test("reads the synced tracks with their revision and origin", async () => {
      const { browser } = await setup();
      const tracks = adminTracksSchema.parse(
        await (await browser.request("/api/v1/admin/tracks")).json(),
      );
      expect(tracks.revision).toBe(1);
      expect(tracks.tracks).toEqual([
        {
          id: "fundamentals",
          title: "Fundamentals",
          summary: "Start here.",
          paperIds: ["rectifier-networks", "second-paper"],
          origin: "library",
        },
      ]);
    });

    test("saves, and learners see the change", async () => {
      const { app, browser } = await setup();
      const response = await browser.request("/api/v1/admin/tracks", {
        method: "PUT",
        body: {
          revision: 1,
          tracks: [
            {
              id: "fundamentals",
              title: "Fundamentals, reordered",
              summary: "Start here.",
              paperIds: ["second-paper", "rectifier-networks"],
            },
            {
              id: "extra",
              title: "Extra",
              summary: "One more.",
              paperIds: ["second-paper"],
            },
          ],
        },
      });
      expect(response.status).toBe(200);
      const saved = adminTracksSchema.parse(await response.json());
      expect(saved.revision).toBe(2);
      expect(saved.tracks.map((track) => track.origin)).toEqual(["cms", "cms"]);

      const learner = trackListSchema.parse(
        await (await app.request("/api/v1/tracks")).json(),
      );
      expect(learner.items.map((track) => [track.id, track.paperIds])).toEqual([
        ["fundamentals", ["second-paper", "rectifier-networks"]],
        ["extra", ["second-paper"]],
      ]);
    });

    test("a stale revision is a conflict and changes nothing", async () => {
      const { browser } = await setup();
      const track = {
        id: "mine",
        title: "Mine",
        summary: "Mine.",
        paperIds: ["second-paper"],
      };
      expect(
        (
          await browser.request("/api/v1/admin/tracks", {
            method: "PUT",
            body: { revision: 1, tracks: [track] },
          })
        ).status,
      ).toBe(200);
      const stale = await browser.request("/api/v1/admin/tracks", {
        method: "PUT",
        body: { revision: 1, tracks: [] },
      });
      expect(stale.status).toBe(409);
      expect(errorBodySchema.parse(await stale.json()).error.code).toBe("conflict");
      const now = adminTracksSchema.parse(
        await (await browser.request("/api/v1/admin/tracks")).json(),
      );
      expect(now.tracks.map((saved) => saved.id)).toEqual(["mine"]);
    });

    test("refuses papers that are not published, and malformed tracks", async () => {
      const { browser, content: fixture } = await setup();
      await fixture.writer.setPaperStatus("second-paper", "draft");
      const draft = await browser.request("/api/v1/admin/tracks", {
        method: "PUT",
        body: {
          revision: 1,
          tracks: [{ id: "t", title: "T", summary: "S", paperIds: ["second-paper"] }],
        },
      });
      expect(draft.status).toBe(400);
      expect(JSON.stringify(await draft.json())).toContain("tracks.0.paperIds.0");

      const unknown = await browser.request("/api/v1/admin/tracks", {
        method: "PUT",
        body: {
          revision: 1,
          tracks: [{ id: "t", title: "T", summary: "S", paperIds: ["no-such-paper"] }],
        },
      });
      expect(unknown.status).toBe(400);

      for (const tracks of [
        [{ id: "Bad Id", title: "T", summary: "S", paperIds: ["rectifier-networks"] }],
        [{ id: "t", title: "", summary: "S", paperIds: ["rectifier-networks"] }],
        [{ id: "t", title: "T", summary: "S", paperIds: [] }],
        [
          {
            id: "t",
            title: "T",
            summary: "S",
            paperIds: ["rectifier-networks", "rectifier-networks"],
          },
        ],
        [
          { id: "t", title: "T", summary: "S", paperIds: ["rectifier-networks"] },
          { id: "t", title: "U", summary: "S", paperIds: ["rectifier-networks"] },
        ],
      ]) {
        const response = await browser.request("/api/v1/admin/tracks", {
          method: "PUT",
          body: { revision: 1, tracks },
        });
        expect(response.status).toBe(400);
      }
    });
  });

  describe("dashboard", () => {
    test("a learner cannot see it", async () => {
      const { browser } = await setup("user");
      expect((await browser.request("/api/v1/admin/dashboard")).status).toBe(404);
    });

    test("answers for a maintainer even when the pipeline is off", async () => {
      const { browser } = await setup();
      const dashboard = dashboardSchema.parse(
        await (await browser.request("/api/v1/admin/dashboard?days=7")).json(),
      );
      expect(dashboard.pipeline.enabled).toBe(false);
      expect(dashboard.daily).toHaveLength(7);
      expect(dashboard.inFlight).toEqual([]);
    });

    test("days outside 1 to 90 are refused", async () => {
      const { browser } = await setup();
      for (const days of ["0", "91", "x"]) {
        expect(
          (await browser.request(`/api/v1/admin/dashboard?days=${days}`)).status,
        ).toBe(400);
      }
    });
  });

  describe("evals", () => {
    test("are not found for anyone without the pipeline, admins included", async () => {
      const { browser } = await setup("admin");
      expect((await browser.request("/api/v1/admin/evals/latest")).status).toBe(404);
    });
  });
});

describe("latestEvalSchema", () => {
  test("accepts no run", () => {
    expect(latestEvalSchema.parse({ run: null })).toEqual({ run: null });
  });
});
