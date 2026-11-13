import { eq, schema, sql } from "@repo/db";
import { errorBodySchema, meSchema } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { TestBrowser } from "../auth-client";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp } from "../helpers";

let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
};

describe("GET /api/v1/me without a session", () => {
  test("answers 401 unauthenticated in the error envelope, uncached", async () => {
    const { app } = createTestApp();
    const response = await app.request("/api/v1/me");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = errorBodySchema.parse(await response.json());
    expect(body.error.code).toBe("unauthenticated");
  });
});

describe.skipIf(!DATABASE_URL)("/api/v1/me", () => {
  const database = useTestDatabase();

  async function signedIn() {
    const { app } = createTestApp({}, undefined, { db: database.db });
    const browser = new TestBrowser(app);
    const username = unique("me_");
    await browser.signUp({ email: `${username}@example.com`, username });
    const me = meSchema.parse(await (await browser.request("/api/v1/me")).json());
    return { app, browser, username, me };
  }

  const patch = (browser: TestBrowser, body: unknown) =>
    browser.request("/api/v1/me", { method: "PATCH", body });

  async function errorOf(response: Response) {
    return errorBodySchema.parse(await response.json()).error;
  }

  test("sets and clears the bio", async () => {
    const { browser } = await signedIn();
    const set = await patch(browser, { bio: "  Reading papers.  " });
    expect(set.status).toBe(200);
    expect(meSchema.parse(await set.json()).bio).toBe("Reading papers.");

    const cleared = await patch(browser, { bio: "" });
    expect(meSchema.parse(await cleared.json()).bio).toBeNull();
  });

  test("changes the username, lowercased, then not again for 30 days", async () => {
    const { browser, me } = await signedIn();
    const next = unique("Renamed_");
    const first = await patch(browser, { username: next });
    expect(first.status).toBe(200);
    expect(meSchema.parse(await first.json()).username).toBe(next.toLowerCase());

    const second = await patch(browser, { username: unique("again_") });
    expect(second.status).toBe(409);
    const error = await errorOf(second);
    expect(error.code).toBe("conflict");
    expect(error.details).toEqual({ availableAt: expect.any(String) });

    // A month later it may change again.
    await database.db
      .update(schema.profiles)
      .set({ usernameChangedAt: sql`now() - interval '31 days'` })
      .where(eq(schema.profiles.userId, me.id));
    expect((await patch(browser, { username: unique("later_") })).status).toBe(200);
  });

  test("keeping the same username is not a change", async () => {
    const { browser, username } = await signedIn();
    expect((await patch(browser, { username: username.toUpperCase() })).status).toBe(200);
    expect((await patch(browser, { username: unique("fresh_") })).status).toBe(200);
  });

  test("refuses a taken, reserved or malformed username", async () => {
    const other = await signedIn();
    const { browser } = await signedIn();

    const taken = await patch(browser, { username: other.username });
    expect(taken.status).toBe(409);
    expect((await errorOf(taken)).message).toBe("That username is taken.");

    for (const username of ["admin", "x", "has space"]) {
      const response = await patch(browser, { username });
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("validation_error");
    }
  });

  test("refuses unknown fields, so role cannot be set", async () => {
    const { browser } = await signedIn();
    const response = await patch(browser, { role: "admin" });
    expect(response.status).toBe(400);
  });

  test("refuses a request from another origin", async () => {
    const { browser } = await signedIn();
    const response = await browser.request("/api/v1/me", {
      method: "PATCH",
      headers: { Origin: "https://evil.example" },
      body: { bio: "pwned" },
    });
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("forbidden");
  });

  test("refuses a body that is not JSON", async () => {
    const { browser } = await signedIn();
    const response = await browser.request("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "bio=hello",
    });
    expect(response.status).toBe(400);
  });

  test("deleting needs the username typed exactly; a mistake changes nothing", async () => {
    const { browser } = await signedIn();
    const wrong = await browser.request("/api/v1/me", {
      method: "DELETE",
      body: { confirm: "someone_else" },
    });
    expect(wrong.status).toBe(400);
    expect((await browser.request("/api/v1/me")).status).toBe(200);
  });

  test("deleting removes every row that references the account and signs out", async () => {
    const { browser, username, me } = await signedIn();
    await patch(browser, { bio: "Goodbye." });
    const candidateId = Bun.randomUUIDv7();
    await database.db
      .insert(schema.contentCandidates)
      .values({ id: candidateId, paperId: "some-paper", createdBy: me.id });

    const response = await browser.request("/api/v1/me", {
      method: "DELETE",
      body: { confirm: username.toUpperCase() },
    });
    expect(response.status).toBe(204);
    expect(
      response.headers.getSetCookie().some((c) => c.includes("session_token=;")),
    ).toBe(true);
    expect((await browser.request("/api/v1/me")).status).toBe(401);

    const db = database.db;
    expect(await db.select().from(schema.user).where(eq(schema.user.id, me.id))).toEqual(
      [],
    );
    expect(
      await db.select().from(schema.session).where(eq(schema.session.userId, me.id)),
    ).toEqual([]);
    expect(
      await db.select().from(schema.account).where(eq(schema.account.userId, me.id)),
    ).toEqual([]);
    expect(
      await db.select().from(schema.profiles).where(eq(schema.profiles.userId, me.id)),
    ).toEqual([]);
    const [candidate] = await db
      .select()
      .from(schema.contentCandidates)
      .where(eq(schema.contentCandidates.id, candidateId));
    expect(candidate?.createdBy).toBeNull();
  });

  test("a deleted account's cached session cookie no longer works", async () => {
    const { app, browser, username } = await signedIn();
    const cookies = browser.cookieHeader();
    await browser.request("/api/v1/me", {
      method: "DELETE",
      body: { confirm: username },
    });
    const replay = await app.request("/api/v1/me", { headers: { Cookie: cookies } });
    expect(replay.status).toBe(401);
  });
});
