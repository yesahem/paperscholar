import { describe, expect, test } from "bun:test";
import { eq, schema } from "@repo/db";
import { demoPdf, ingestionKeys } from "@repo/pipeline";
import {
  errorBodySchema,
  ingestionCreatedSchema,
  ingestionDetailSchema,
  ingestionListSchema,
  uploadUrlResponseSchema,
} from "@repo/shared";
import { silentLogger } from "@repo/shared/logger";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPipelineDeps } from "../../src/adapters/pipeline";
import { TestBrowser } from "../auth-client";
import { DATABASE_URL, useTestDatabase } from "../database";
import {
  createTestApp,
  TEST_PIPELINE_LIMITS,
  testConfig,
  unusedSandbox,
} from "../helpers";

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

describe("admin ingestion routes on an instance without the pipeline", () => {
  test("are not found for everyone, maintainers included", async () => {
    const { app } = createTestApp();
    expect((await app.request("/api/v1/admin/ingestions")).status).toBe(404);
  });
});

describe.skipIf(!DATABASE_URL)("admin ingestion routes", () => {
  const database = useTestDatabase();

  async function setup(role: "user" | "maintainer" = "maintainer") {
    const root = await mkdtemp(join(tmpdir(), "ingest-routes-"));
    const config = testConfig({
      storage: { driver: "fs", root },
      pipeline: {
        llm: { driver: "fake", model: "fake-demo" },
        enabled: true,
        limits: { ...TEST_PIPELINE_LIMITS, maxPdfBytes: 64 * 1024 },
      },
    });
    const deps = createPipelineDeps(config, {
      db: database.db,
      sandbox: unusedSandbox,
      logger: silentLogger,
    });
    if (!deps) throw new Error("the fake model should enable the pipeline");
    const kicks: string[] = [];
    const runner = {
      kick: (origin: string) => {
        kicks.push(origin);
      },
      runOnce: async () => ({ ran: 0, moreWork: false }),
    };
    const { app } = createTestApp(config, undefined, {
      db: database.db,
      pipeline: { deps, runner },
    });
    const browser = new TestBrowser(app);
    const username = `mt${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    await browser.signUp({ email: `${username}@example.com`, username });
    await database.db
      .update(schema.user)
      .set({ role })
      .where(eq(schema.user.username, username));
    return { app, browser, deps, kicks };
  }

  async function uploadDemo(browser: TestBrowser, seed: string) {
    const pdf = demoPdf(seed);
    const response = await browser.request("/api/v1/admin/ingestions/upload-url", {
      method: "POST",
      body: { filename: "paper.pdf", size: pdf.byteLength },
    });
    expect(response.status).toBe(200);
    const target = uploadUrlResponseSchema.parse(await response.json());
    // With fs storage the browser uploads through the API.
    expect(target.upload.url).toStartWith("/api/v1/admin/ingestions/uploads/");
    const put = await browser.send(target.upload.url, pdf, "application/pdf");
    expect(put.status).toBe(204);
    return target.pdfKey;
  }

  test("a learner cannot see that the endpoints exist", async () => {
    const { browser } = await setup("user");
    expect((await browser.request("/api/v1/admin/ingestions")).status).toBe(404);
    const created = await browser.request("/api/v1/admin/ingestions/upload-url", {
      method: "POST",
      body: { filename: "x.pdf", size: 10 },
    });
    expect(created.status).toBe(404);
  });

  test("upload, start, and the same PDF again returns the existing ingestion", async () => {
    const { browser, deps, kicks } = await setup();
    const pdfKey = await uploadDemo(browser, "route-1");

    const missingRights = await browser.request("/api/v1/admin/ingestions", {
      method: "POST",
      body: { pdfKey },
    });
    expect(missingRights.status).toBe(400);

    const response = await browser.request("/api/v1/admin/ingestions", {
      method: "POST",
      body: { pdfKey, rightsConfirmed: true, options: { focus: "the loss only" } },
    });
    expect(response.status).toBe(202);
    const created = ingestionCreatedSchema.parse(await response.json());
    expect(created).toMatchObject({ status: "queued", created: true });
    expect(kicks).toHaveLength(1);
    // The upload was moved into the ingestion's own folder.
    expect(await deps.storage.head(pdfKey)).toBeNull();
    expect(await deps.storage.head(ingestionKeys(created.id).source)).not.toBeNull();

    const again = await browser.request("/api/v1/admin/ingestions", {
      method: "POST",
      body: { pdfKey: await uploadDemo(browser, "route-1"), rightsConfirmed: true },
    });
    expect(again.status).toBe(200);
    expect(ingestionCreatedSchema.parse(await again.json())).toEqual({
      ...created,
      created: false,
    });
    expect(kicks).toHaveLength(1);

    const detail = ingestionDetailSchema.parse(
      await (await browser.request(`/api/v1/admin/ingestions/${created.id}`)).json(),
    );
    expect(detail).toMatchObject({
      status: "queued",
      options: { focus: "the loss only", pauseAfterPlan: false },
      model: "fake-demo",
      outline: null,
      plan: null,
      stepStates: [],
    });
    const list = ingestionListSchema.parse(
      await (await browser.request("/api/v1/admin/ingestions")).json(),
    );
    expect(list.ingestions.map((ingestion) => ingestion.id)).toContain(created.id);
  });

  test("refuses files that are not PDFs, too large, or someone else's upload", async () => {
    const { browser } = await setup();
    const tooLarge = await browser.request("/api/v1/admin/ingestions/upload-url", {
      method: "POST",
      body: { filename: "big.pdf", size: 10 * 1024 * 1024 },
    });
    expect(tooLarge.status).toBe(413);

    const target = uploadUrlResponseSchema.parse(
      await (
        await browser.request("/api/v1/admin/ingestions/upload-url", {
          method: "POST",
          body: { filename: "x.pdf", size: 20 },
        })
      ).json(),
    );
    const html = await browser.send(
      target.upload.url,
      new TextEncoder().encode("<html>hello</html>"),
      "application/pdf",
    );
    expect(html.status).toBe(400);
    const oversized = await browser.send(
      target.upload.url,
      new Uint8Array(65 * 1024),
      "application/pdf",
    );
    expect(oversized.status).toBe(413);

    const other = await setup();
    const theirs = await uploadDemo(other.browser, "theirs");
    const stolen = await browser.request("/api/v1/admin/ingestions", {
      method: "POST",
      body: { pdfKey: theirs, rightsConfirmed: true },
    });
    expect(stolen.status).toBe(400);
    expect((await errorOf(stolen)).message).toBe(
      "Upload the PDF first; that upload is not yours.",
    );

    const both = await browser.request("/api/v1/admin/ingestions", {
      method: "POST",
      body: { pdfKey: theirs, arxivId: "1706.03762", rightsConfirmed: true },
    });
    expect(both.status).toBe(400);
  });

  test("an unknown ingestion is not found", async () => {
    const { browser } = await setup();
    const response = await browser.request(
      `/api/v1/admin/ingestions/${crypto.randomUUID()}`,
    );
    expect(response.status).toBe(404);
    expect((await browser.request("/api/v1/admin/ingestions/not-a-uuid")).status).toBe(
      400,
    );
  });
});
