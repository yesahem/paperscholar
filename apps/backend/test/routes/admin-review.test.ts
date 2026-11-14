import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, schema } from "@repo/db";
import { DEMO_FILES, demoPdf, PIPELINE_HANDLERS, tick } from "@repo/pipeline";
import { defaultLocalPythonPath, LocalProvider } from "@repo/runner";
import {
  adminPaperListSchema,
  adminUserListSchema,
  errorBodySchema,
  ingestionCreatedSchema,
  ingestionDetailSchema,
  ingestionStepFilesSchema,
  publishedPaperSchema,
  reverifyResponseSchema,
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
  readOnlyStore,
  TEST_PIPELINE_LIMITS,
  testConfig,
} from "../helpers";

setDefaultTimeout(240_000);

const pythonPath = defaultLocalPythonPath();
const hasPython =
  Bun.spawnSync([pythonPath, "-c", "import numpy, pytest"]).exitCode === 0;

describe.skipIf(!DATABASE_URL || !hasPython)("reviewing and publishing over HTTP", () => {
  const database = useTestDatabase();

  async function setup() {
    const root = await mkdtemp(join(tmpdir(), "review-routes-"));
    const config = testConfig({
      storage: { driver: "fs", root },
      pipeline: {
        llm: { driver: "fake", model: "fake-demo" },
        enabled: true,
        limits: TEST_PIPELINE_LIMITS,
      },
    });
    const deps = createPipelineDeps(config, {
      db: database.db,
      sandbox: new LocalProvider({ pythonPath, nodeEnv: "test" }),
      logger: silentLogger,
    });
    if (!deps) throw new Error("the fake model should enable the pipeline");
    const runner = { kick: () => {}, runOnce: async () => ({ ran: 0, moreWork: false }) };
    const { app } = createTestApp(config, readOnlyStore(root), {
      db: database.db,
      pipeline: { deps, runner },
    });
    const signUp = async (role: "user" | "maintainer" | "admin") => {
      const browser = new TestBrowser(app);
      const username = `r${role[0]}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
      await browser.signUp({ email: `${username}@example.com`, username });
      await database.db
        .update(schema.user)
        .set({ role })
        .where(eq(schema.user.username, username));
      return { browser, username };
    };
    const drain = async () => {
      for (let round = 0; round < 30; round += 1) {
        if ((await tick(deps, { handlers: PIPELINE_HANDLERS, concurrency: 4 })).ran === 0)
          return;
      }
    };
    return { app, deps, signUp, drain };
  }

  test("a broken test blocks publishing; once fixed and re-verified the paper reaches learners", async () => {
    const { app, signUp, drain } = await setup();
    const { browser } = await signUp("maintainer");
    const pdf = demoPdf("http-review");
    const target = uploadUrlResponseSchema.parse(
      await (
        await browser.request("/api/v1/admin/ingestions/upload-url", {
          method: "POST",
          body: { filename: "p.pdf", size: pdf.byteLength },
        })
      ).json(),
    );
    await browser.send(target.upload.url, pdf, "application/pdf");
    const { id } = ingestionCreatedSchema.parse(
      await (
        await browser.request("/api/v1/admin/ingestions", {
          method: "POST",
          body: { pdfKey: target.pdfKey, rightsConfirmed: true },
        })
      ).json(),
    );
    await drain();

    const detail = async () =>
      ingestionDetailSchema.parse(
        await (await browser.request(`/api/v1/admin/ingestions/${id}`)).json(),
      );
    const ready = await detail();
    expect(ready.status).toBe("ready_for_review");
    expect(ready.publishProblems).toEqual([]);
    expect(ready.outline?.chunks.map((chunk) => chunk.pageStart)).toEqual([1, 1, 2, 3]);
    expect(ready.report?.steps).toHaveLength(4);

    const step = ingestionStepFilesSchema.parse(
      await (await browser.request(`/api/v1/admin/ingestions/${id}/steps/relu`)).json(),
    );
    expect(
      step.current.verification?.checks.every((check) => check.status === "passed"),
    ).toBe(true);
    const broken = {
      ...step.current.files,
      testsPublic: step.current.files.testsPublic.replace("[0.0, 2.0]", "[1.0, 2.0]"),
    };
    expect(
      (
        await browser.request(`/api/v1/admin/ingestions/${id}/steps/relu`, {
          method: "PUT",
          body: broken,
        })
      ).status,
    ).toBe(200);
    expect((await detail()).publishProblems).toEqual([
      "relu: has not been verified on its current files.",
    ]);

    const refused = await browser.request(`/api/v1/admin/ingestions/${id}/publish`, {
      method: "POST",
    });
    expect(refused.status).toBe(409);
    expect(errorBodySchema.parse(await refused.json()).error.message).toContain(
      "relu: has not been verified",
    );

    const quick = reverifyResponseSchema.parse(
      await (
        await browser.request(`/api/v1/admin/ingestions/${id}/steps/relu/verify`, {
          method: "POST",
          body: { full: false },
        })
      ).json(),
    );
    // The same per-test view a learner gets: the failing test and its message.
    expect(
      quick.verification?.checks.find((check) => check.id === "V2")?.details.join("\n"),
    ).toContain("test_negative_values_become_zero");

    await browser.request(`/api/v1/admin/ingestions/${id}/steps/relu`, {
      method: "PUT",
      body: DEMO_FILES.relu,
    });
    const full = await browser.request(
      `/api/v1/admin/ingestions/${id}/steps/relu/verify`,
      { method: "POST", body: { full: true } },
    );
    expect(full.status).toBe(202);
    await drain();
    expect((await detail()).publishProblems).toEqual([]);

    const published = publishedPaperSchema.parse(
      await (
        await browser.request(`/api/v1/admin/ingestions/${id}/publish`, {
          method: "POST",
        })
      ).json(),
    );
    expect(published.version).toBe(1);

    // Learners see it, without solutions or tests.
    const paper = await app.request(`/api/v1/papers/${published.paperId}`);
    expect(paper.status).toBe(200);
    const problem = await (
      await app.request(`/api/v1/papers/${published.paperId}/problems/relu`)
    ).text();
    expect(problem).not.toContain("np.maximum(x, 0)");
    expect(problem).not.toContain("def test_");

    const papers = adminPaperListSchema.parse(
      await (await browser.request("/api/v1/admin/papers")).json(),
    );
    expect(papers.papers.find((entry) => entry.id === published.paperId)).toMatchObject({
      status: "published",
      ingestionId: id,
      source: "pipeline",
    });
    const archived = await browser.request(
      `/api/v1/admin/papers/${published.paperId}/archive`,
      { method: "POST" },
    );
    expect(archived.status).toBe(200);
    expect((await app.request(`/api/v1/papers`)).status).toBe(200);
  });

  test("only admins manage roles, and the last admin cannot be demoted", async () => {
    const { signUp } = await setup();
    const maintainer = await signUp("maintainer");
    expect((await maintainer.browser.request("/api/v1/admin/users")).status).toBe(404);

    const admin = await signUp("admin");
    const found = adminUserListSchema.parse(
      await (
        await admin.browser.request(
          `/api/v1/admin/users?q=${maintainer.username.slice(0, 6)}`,
        )
      ).json(),
    );
    const target = found.users.find((user) => user.username === maintainer.username);
    expect(target?.role).toBe("maintainer");
    const promoted = await admin.browser.request(`/api/v1/admin/users/${target?.id}`, {
      method: "PATCH",
      body: { role: "user" },
    });
    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toMatchObject({ role: "user" });

    const admins = await database.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.role, "admin"));
    expect(admins).toHaveLength(1);
    const demoted = await admin.browser.request(`/api/v1/admin/users/${admins[0]?.id}`, {
      method: "PATCH",
      body: { role: "user" },
    });
    expect(demoted.status).toBe(409);
  });
});
