import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, schema } from "@repo/db";
import {
  adminFeedbackItemSchema,
  adminFeedbackListSchema,
  errorBodySchema,
  feedbackItemSchema,
  feedbackListSchema,
  publicReviewListSchema,
  type Role,
} from "@repo/shared";
import { TestBrowser } from "../auth-client";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, testConfig } from "../helpers";

let content: SyncedContent;
beforeAll(async () => {
  content = await syncedContent();
});
afterAll(async () => {
  await content.cleanup();
});

describe("feedback without a session", () => {
  test("filing is 401; only reviews can be listed publicly", async () => {
    const { app } = createTestApp({}, content.reader);
    const browser = new TestBrowser(app);
    const post = await browser.request("/api/v1/feedback", {
      method: "POST",
      body: { type: "review", body: "Great" },
    });
    expect(post.status).toBe(401);
    for (const query of ["", "?type=bug", "?mine=0"]) {
      expect((await browser.request(`/api/v1/feedback${query}`)).status).toBe(400);
    }
    expect((await browser.request("/api/v1/feedback?mine=1")).status).toBe(401);
  });

  test("the inbox does not exist for anyone signed out", async () => {
    const { app } = createTestApp({}, content.reader);
    expect((await app.request("/api/v1/admin/feedback")).status).toBe(404);
  });
});

describe.skipIf(!DATABASE_URL)("feedback", () => {
  const database = useTestDatabase();
  type Limits = ReturnType<typeof testConfig>["limits"];

  function app(limits: Partial<Limits> = {}) {
    const config = testConfig();
    return createTestApp(
      { limits: { ...config.limits, ...limits }, cmsOrigin: "http://localhost:3001" },
      content.reader,
      { db: database.db },
    ).app;
  }

  async function account(
    role: Role = "user",
    target = app(),
  ): Promise<{ browser: TestBrowser; username: string }> {
    const browser = new TestBrowser(target);
    const username = `fb${role.slice(0, 2)}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    await browser.signUp({ email: `${username}@example.com`, username });
    if (role !== "user") {
      await database.db
        .update(schema.user)
        .set({ role })
        .where(eq(schema.user.username, username));
    }
    return { browser, username };
  }

  async function file(browser: TestBrowser, body: Record<string, unknown>) {
    const response = await browser.request("/api/v1/feedback", { method: "POST", body });
    expect(response.status).toBe(201);
    return feedbackItemSchema.parse(await response.json());
  }

  async function publicReviews(browser: TestBrowser) {
    return publicReviewListSchema.parse(
      await (await browser.request("/api/v1/feedback?type=review&limit=100")).json(),
    );
  }

  test("a review is public only after an admin approves it, and shows no email", async () => {
    const { browser, username } = await account();
    const { browser: admin } = await account("admin");
    const review = await file(browser, {
      type: "review",
      rating: 5,
      body: "  Clear steps.  ",
    });
    expect(review).toMatchObject({
      type: "review",
      rating: 5,
      body: "Clear steps.",
      status: "pending",
    });
    expect((await publicReviews(browser)).items.map((item) => item.id)).not.toContain(
      review.id,
    );

    const approved = await admin.request(`/api/v1/admin/feedback/${review.id}`, {
      method: "PATCH",
      body: { status: "approved" },
    });
    expect(approved.status).toBe(200);
    expect(adminFeedbackItemSchema.parse(await approved.json()).status).toBe("approved");

    const signedOut = new TestBrowser(app());
    const response = await signedOut.request("/api/v1/feedback?type=review&limit=100");
    const text = await response.text();
    expect(text).not.toContain("@example.com");
    const listed = publicReviewListSchema
      .parse(JSON.parse(text))
      .items.find((item) => item.id === review.id);
    expect(listed).toEqual({
      id: review.id,
      rating: 5,
      body: "Clear steps.",
      author: { username, avatarUrl: null },
      createdAt: review.createdAt,
    });
  });

  test("a step report names a real step of a published paper", async () => {
    const { browser } = await account();
    const report = await file(browser, {
      type: "bug",
      body: "The second hidden test expects the wrong shape.",
      paperId: "rectifier-networks",
      problemId: "clipped",
    });
    expect(report).toMatchObject({
      type: "bug",
      status: "open",
      rating: null,
      paperId: "rectifier-networks",
      problemId: "clipped",
    });

    for (const [body, path] of [
      [{ paperId: "no-such-paper", problemId: "relu" }, "paperId"],
      [{ paperId: "rectifier-networks", problemId: "no-such-step" }, "problemId"],
    ] as const) {
      const response = await browser.request("/api/v1/feedback", {
        method: "POST",
        body: { type: "bug", body: "Wrong", ...body },
      });
      expect(response.status).toBe(400);
      expect(errorBodySchema.parse(await response.json()).error.details).toEqual({
        issues: [{ path, message: expect.any(String) }],
      });
    }
  });

  test("mine=1 lists the caller's own items, bug reports included, and no one else's", async () => {
    const { browser } = await account();
    const { browser: other } = await account();
    const bug = await file(browser, { type: "bug", body: "Typo in step 1" });
    const review = await file(browser, { type: "review", body: "Nice" });
    await file(other, { type: "bug", body: "Someone else's report" });

    const mine = feedbackListSchema.parse(
      await (await browser.request("/api/v1/feedback?mine=1")).json(),
    );
    expect(mine.items.map((item) => item.id)).toEqual([review.id, bug.id]);
    const bugs = feedbackListSchema.parse(
      await (await browser.request("/api/v1/feedback?mine=1&type=bug")).json(),
    );
    expect(bugs.items.map((item) => item.id)).toEqual([bug.id]);
    const paged = feedbackListSchema.parse(
      await (await browser.request("/api/v1/feedback?mine=1&limit=1")).json(),
    );
    expect(paged.items).toHaveLength(1);
    expect(paged.nextCursor).not.toBeNull();
  });

  test("the author edits; an edited review needs approval again; others get 404", async () => {
    const { browser } = await account();
    const { browser: stranger } = await account();
    const { browser: admin } = await account("admin");
    const review = await file(browser, { type: "review", rating: 3, body: "Okay" });
    await admin.request(`/api/v1/admin/feedback/${review.id}`, {
      method: "PATCH",
      body: { status: "approved" },
    });

    const edited = await browser.request(`/api/v1/feedback/${review.id}`, {
      method: "PATCH",
      body: { body: "Better than okay", rating: 4 },
    });
    expect(feedbackItemSchema.parse(await edited.json())).toMatchObject({
      body: "Better than okay",
      rating: 4,
      status: "pending",
    });

    const byStranger = await stranger.request(`/api/v1/feedback/${review.id}`, {
      method: "PATCH",
      body: { body: "Hijacked" },
    });
    expect(byStranger.status).toBe(404);

    await admin.request(`/api/v1/admin/feedback/${review.id}`, {
      method: "PATCH",
      body: { status: "approved" },
    });
    const corrected = await admin.request(`/api/v1/feedback/${review.id}`, {
      method: "PATCH",
      body: { body: "Better than okay." },
    });
    expect(feedbackItemSchema.parse(await corrected.json()).status).toBe("approved");

    const bug = await file(browser, { type: "bug", body: "Broken" });
    const rated = await browser.request(`/api/v1/feedback/${bug.id}`, {
      method: "PATCH",
      body: { rating: 2 },
    });
    expect(rated.status).toBe(400);
  });

  test("the author or an admin deletes; anyone else gets 404", async () => {
    const { browser } = await account();
    const { browser: stranger } = await account();
    const { browser: admin } = await account("admin");
    const first = await file(browser, { type: "bug", body: "One" });
    const second = await file(browser, { type: "bug", body: "Two" });

    expect(
      (await stranger.request(`/api/v1/feedback/${first.id}`, { method: "DELETE" }))
        .status,
    ).toBe(404);
    expect(
      (await browser.request(`/api/v1/feedback/${first.id}`, { method: "DELETE" }))
        .status,
    ).toBe(204);
    expect(
      (await admin.request(`/api/v1/feedback/${second.id}`, { method: "DELETE" })).status,
    ).toBe(204);
    const mine = feedbackListSchema.parse(
      await (await browser.request("/api/v1/feedback?mine=1")).json(),
    );
    expect(mine.items).toEqual([]);
  });

  test("filing is limited per day", async () => {
    const target = app({ feedbackPerDay: 2 });
    const { browser } = await account("user", target);
    await file(browser, { type: "bug", body: "One" });
    await file(browser, { type: "bug", body: "Two" });
    const third = await browser.request("/api/v1/feedback", {
      method: "POST",
      body: { type: "bug", body: "Three" },
    });
    expect(third.status).toBe(429);
    expect(errorBodySchema.parse(await third.json()).error.code).toBe("quota_exceeded");
  });

  describe("the CMS inbox", () => {
    test("is invisible to learners", async () => {
      const { browser } = await account();
      expect((await browser.request("/api/v1/admin/feedback")).status).toBe(404);
    });

    test("shows a step report to maintainers with its paper, problem, author and review screen", async () => {
      const { browser, username } = await account();
      const { browser: maintainer } = await account("maintainer");
      const report = await file(browser, {
        type: "bug",
        body: "Unclear description",
        paperId: "second-paper",
        problemId: "relu",
      });
      const [ingestion] = await database.db
        .insert(schema.ingestions)
        .values({
          id: crypto.randomUUID(),
          status: "published",
          sourceType: "pdf",
          pdfSha256: crypto.randomUUID(),
          paperId: "second-paper",
          model: "fake",
          promptVersion: "test",
        })
        .returning({ id: schema.ingestions.id });

      const inbox = adminFeedbackListSchema.parse(
        await (
          await maintainer.request(
            "/api/v1/admin/feedback?type=bug&status=open&limit=100",
          )
        ).json(),
      );
      const item = inbox.items.find((candidate) => candidate.id === report.id);
      expect(item).toMatchObject({
        type: "bug",
        status: "open",
        body: "Unclear description",
        paperId: "second-paper",
        problemId: "relu",
        author: { username },
        ingestionId: ingestion?.id ?? "missing",
      });
    });

    test("maintainers resolve bug reports; only admins approve reviews", async () => {
      const { browser } = await account();
      const { browser: maintainer } = await account("maintainer");
      const bug = await file(browser, { type: "bug", body: "Broken link" });
      const review = await file(browser, { type: "review", body: "Lovely" });

      const resolved = await maintainer.request(`/api/v1/admin/feedback/${bug.id}`, {
        method: "PATCH",
        body: { status: "resolved" },
      });
      expect(adminFeedbackItemSchema.parse(await resolved.json()).status).toBe(
        "resolved",
      );

      const approve = await maintainer.request(`/api/v1/admin/feedback/${review.id}`, {
        method: "PATCH",
        body: { status: "approved" },
      });
      expect(approve.status).toBe(403);

      const mismatched = await maintainer.request(`/api/v1/admin/feedback/${bug.id}`, {
        method: "PATCH",
        body: { status: "approved" },
      });
      expect(mismatched.status).toBe(400);

      const missing = await maintainer.request(
        `/api/v1/admin/feedback/${crypto.randomUUID()}`,
        { method: "PATCH", body: { status: "resolved" } },
      );
      expect(missing.status).toBe(404);
    });
  });
});
