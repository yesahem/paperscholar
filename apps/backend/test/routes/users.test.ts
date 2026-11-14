import {
  errorBodySchema,
  publicProfileSchema,
  userCardListSchema,
  userSearchResultSchema,
} from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { USER_SEARCHES_PER_MINUTE } from "../../src/routes/users";
import { TestBrowser } from "../auth-client";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, memoryEmailSender } from "../helpers";

let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter}`;
};

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

describe("/api/v1/users without a database query", () => {
  test("a search shorter than two characters, or with other characters, is refused", async () => {
    const { app } = createTestApp();
    for (const q of ["a", "a%25", ""]) {
      const response = await app.request(`/api/v1/users?q=${q}`);
      expect(response.status).toBe(400);
    }
  });

  test("following needs a session", async () => {
    const { app } = createTestApp();
    const response = await app.request("/api/v1/users/someone/follow", {
      method: "PUT",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(response.status).toBe(401);
  });
});

describe.skipIf(!DATABASE_URL)("/api/v1/users", () => {
  const database = useTestDatabase();

  async function person(app = createTestApp({}, undefined, { db: database.db }).app) {
    const browser = new TestBrowser(app);
    const username = unique("pp_");
    await browser.signUp({ email: `${username}@example.com`, username });
    return { app, browser, username };
  }

  test("a profile is public, uncached, and carries no email or role", async () => {
    const { app, username } = await person();
    const response = await app.request(`/api/v1/users/${username.toUpperCase()}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const text = await response.text();
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain('"role"');
    const profile = publicProfileSchema.parse(JSON.parse(text));
    expect(profile).toMatchObject({ username, isFollowedByMe: null });
  });

  test("an unknown username is 404", async () => {
    const { app } = await person();
    const response = await app.request("/api/v1/users/nobody_at_all");
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("not_found");
  });

  test("follow and unfollow are idempotent and show on the profile", async () => {
    const ada = await person();
    const bob = await person(ada.app);
    for (let i = 0; i < 2; i += 1) {
      const followed = await ada.browser.request(`/api/v1/users/${bob.username}/follow`, {
        method: "PUT",
      });
      expect(followed.status).toBe(204);
    }
    const seen = publicProfileSchema.parse(
      await (await ada.browser.request(`/api/v1/users/${bob.username}`)).json(),
    );
    expect(seen).toMatchObject({ followerCount: 1, isFollowedByMe: true });

    const following = userCardListSchema.parse(
      await (await ada.app.request(`/api/v1/users/${ada.username}/following`)).json(),
    );
    expect(following).toEqual({
      items: [{ username: bob.username, avatarUrl: null }],
      nextCursor: null,
    });

    for (let i = 0; i < 2; i += 1) {
      const unfollowed = await ada.browser.request(
        `/api/v1/users/${bob.username}/follow`,
        { method: "DELETE" },
      );
      expect(unfollowed.status).toBe(204);
    }
    const after = publicProfileSchema.parse(
      await (await ada.browser.request(`/api/v1/users/${bob.username}`)).json(),
    );
    expect(after).toMatchObject({ followerCount: 0, isFollowedByMe: false });
  });

  test("following yourself is a validation error", async () => {
    const { browser, username } = await person();
    const response = await browser.request(`/api/v1/users/${username}/follow`, {
      method: "PUT",
    });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toBe("You cannot follow yourself.");
  });

  test("on an instance that verifies email, following needs a confirmed address", async () => {
    const { app } = createTestApp({ email: { driver: "log" } }, undefined, {
      db: database.db,
      email: memoryEmailSender(),
    });
    const ada = await person(app);
    const bob = await person(app);
    const response = await ada.browser.request(`/api/v1/users/${bob.username}/follow`, {
      method: "PUT",
    });
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("email_not_verified");
  });

  test("search finds usernames by prefix and is limited per address", async () => {
    const { app, username } = await person();
    const prefix = username.slice(0, -1);
    const found = userSearchResultSchema.parse(
      await (await app.request(`/api/v1/users?q=${prefix.toUpperCase()}`)).json(),
    );
    expect(found.items.map((item) => item.username)).toContain(username);

    const from = (ip: string) =>
      app.request(`/api/v1/users?q=${prefix}`, { headers: { "x-forwarded-for": ip } });
    for (let i = 0; i < USER_SEARCHES_PER_MINUTE; i += 1) {
      expect((await from("203.0.113.77")).status).toBe(200);
    }
    const limited = await from("203.0.113.77");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await from("203.0.113.78")).status).toBe(200);
  });
});
