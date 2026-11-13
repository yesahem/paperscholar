import { eq, schema } from "@repo/db";
import { meSchema } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { linkIn, TestBrowser, WEB_ORIGIN } from "../auth-client";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createAuth } from "../../src/auth/auth";
import { silentLogger } from "../../src/lib/logger";
import { createRateLimiter } from "../../src/services/rate-limiter";
import { createTestApp, memoryEmailSender, testConfig } from "../helpers";

let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
};

describe.skipIf(!DATABASE_URL)("accounts through Better Auth", () => {
  const database = useTestDatabase();

  /** A minimal instance: no email sender, so no verification (docs/specs/13-self-hosting.md §4). */
  function minimalApp(overrides: Parameters<typeof testConfig>[0] = {}) {
    return createTestApp(overrides, undefined, { db: database.db });
  }

  /** An instance with an email sender: verification and reset by email. */
  function emailApp(overrides: Parameters<typeof testConfig>[0] = {}) {
    const email = memoryEmailSender();
    const app = createTestApp({ email: { driver: "log" }, ...overrides }, undefined, {
      db: database.db,
      email,
    });
    return { ...app, email };
  }

  async function me(browser: TestBrowser) {
    const response = await browser.request("/api/v1/me");
    return { response, body: response.ok ? meSchema.parse(await response.json()) : null };
  }

  test("sign-up signs in, stores the username lowercase and creates a profile", async () => {
    const { app } = minimalApp();
    const browser = new TestBrowser(app);
    const username = unique("Ada_");
    const email = `${username}@example.com`;

    const response = await browser.signUp({ email, username });
    expect(response.status).toBe(200);

    const { body } = await me(browser);
    expect(body).toMatchObject({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      emailVerified: false,
      role: "user",
      bio: null,
      avatarUrl: null,
    });
    const profiles = await database.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, body?.id ?? ""));
    expect(profiles).toHaveLength(1);
  });

  test("auth responses carry the request id and the standard headers", async () => {
    const { app } = minimalApp();
    const response = await app.request("/api/auth/get-session");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("the session cookie is HttpOnly, SameSite=Lax and host-only", async () => {
    const { app } = minimalApp();
    const browser = new TestBrowser(app);
    const username = unique("cookie_");
    const response = await browser.signUp({ email: `${username}@example.com`, username });

    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("paperscholar.session_token="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).not.toMatch(/Domain=/i);
  });

  test("on an https site the cookie is Secure", async () => {
    const { app } = minimalApp({ webOrigin: "https://paperscholar.example" });
    const username = unique("secure_");
    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        Origin: "https://paperscholar.example",
        "Content-Type": "application/json",
        "x-forwarded-for": "198.51.100.200",
      },
      body: JSON.stringify({
        email: `${username}@example.com`,
        username,
        name: username,
        password: "correct horse battery",
      }),
    });
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toStartWith("__Secure-paperscholar.session_token=");
    expect(sessionCookie).toContain("Secure");
  });

  test("sign-out ends the session; sign-in starts a new one", async () => {
    const { app } = minimalApp();
    const browser = new TestBrowser(app);
    const username = unique("grace_");
    const email = `${username}@example.com`;
    await browser.signUp({ email, username });

    expect((await browser.signOut()).status).toBe(200);
    expect((await me(browser)).response.status).toBe(401);

    expect((await browser.signIn(email, "wrong password")).status).toBe(401);
    expect((await browser.signIn(email)).status).toBe(200);
    expect((await me(browser)).body?.username).toBe(username);
  });

  test("reserved, malformed and taken usernames are refused at sign-up", async () => {
    const { app } = minimalApp();
    const taken = unique("taken_");
    await new TestBrowser(app).signUp({ email: `${taken}@example.com`, username: taken });

    for (const username of ["admin", "no spaces", "ab", taken]) {
      const response = await new TestBrowser(app).signUp({
        email: `${unique("x")}@example.com`,
        username,
      });
      expect(response.status).toBe(400);
    }
  });

  test("passwords must be 8 to 128 characters", async () => {
    const { app } = minimalApp();
    for (const password of ["short", "x".repeat(129)]) {
      const username = unique("pw_");
      const response = await new TestBrowser(app).signUp({
        email: `${username}@example.com`,
        username,
        password,
      });
      expect(response.status).toBe(400);
    }
  });

  test("with sign-ups switched off, nobody can create an account", async () => {
    const { app } = minimalApp({ auth: { ...testConfig().auth, signups: false } });
    const username = unique("closed_");
    const response = await new TestBrowser(app).signUp({
      email: `${username}@example.com`,
      username,
    });
    expect(response.status).toBe(400);
    const users = await database.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.username, username));
    expect(users).toHaveLength(0);
  });

  test("a verification email arrives and its link verifies the address", async () => {
    const { app, email: outbox, settle } = emailApp();
    const browser = new TestBrowser(app);
    const username = unique("verify_");
    const address = `${username}@example.com`;
    await browser.request("/api/auth/sign-up/email", {
      method: "POST",
      body: {
        email: address,
        username,
        name: username,
        password: "correct horse battery",
        callbackURL: "/verify-email",
      },
    });
    await settle();

    const message = outbox.sent.find((sent) => sent.to === address);
    expect(message?.subject).toContain("Confirm your email");
    const link = linkIn(message?.text ?? "");
    expect(link.origin).toBe(WEB_ORIGIN);
    expect(link.pathname).toBe("/api/auth/verify-email");

    const verified = await browser.request(`${link.pathname}${link.search}`);
    expect(verified.status).toBe(302);
    expect(verified.headers.get("Location")).toStartWith("/verify-email");
    expect((await me(browser)).body?.emailVerified).toBe(true);
  });

  test("ADMIN_EMAILS: admin at sign-up when the instance does not verify emails", async () => {
    const username = unique("boss_");
    const address = `${username}@example.com`;
    const { app } = minimalApp({
      auth: { ...testConfig().auth, adminEmails: [address] },
    });
    const browser = new TestBrowser(app);
    await browser.signUp({ email: address, username });
    expect((await me(browser)).body?.role).toBe("admin");

    const other = new TestBrowser(app);
    const otherName = unique("staff_");
    await other.signUp({ email: `${otherName}@example.com`, username: otherName });
    expect((await me(other)).body?.role).toBe("user");
  });

  test("ADMIN_EMAILS: admin only once verified when the instance verifies emails", async () => {
    const username = unique("chief_");
    const address = `${username}@example.com`;
    const {
      app,
      email: outbox,
      settle,
    } = emailApp({
      auth: { ...testConfig().auth, adminEmails: [address] },
    });
    const browser = new TestBrowser(app);
    await browser.signUp({ email: address, username });
    await settle();
    expect((await me(browser)).body?.role).toBe("user");

    const link = linkIn(outbox.sent.find((sent) => sent.to === address)?.text ?? "");
    await browser.request(`${link.pathname}${link.search}`);
    expect((await me(browser)).body?.role).toBe("admin");
  });

  test("a reset request looks the same for known and unknown addresses", async () => {
    const { app, email: outbox, settle } = emailApp();
    const username = unique("reset_");
    const address = `${username}@example.com`;
    await new TestBrowser(app).signUp({ email: address, username });
    await settle();
    outbox.sent.length = 0;

    const ask = (email: string) =>
      new TestBrowser(app).request("/api/auth/request-password-reset", {
        method: "POST",
        body: { email, redirectTo: "/reset-password" },
      });
    const known = await ask(address);
    const unknown = await ask(`nobody-${username}@example.com`);
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());

    await settle();
    expect(outbox.sent.map((sent) => sent.to)).toEqual([address]);
  });

  test("resetting the password signs out every session", async () => {
    const { app, email: outbox, settle } = emailApp();
    const browser = new TestBrowser(app);
    const username = unique("forgot_");
    const address = `${username}@example.com`;
    await browser.signUp({ email: address, username });
    await browser.request("/api/auth/request-password-reset", {
      method: "POST",
      body: { email: address, redirectTo: "/reset-password" },
    });
    await settle();

    const link = linkIn(
      outbox.sent.find((sent) => sent.subject.includes("Reset"))?.text ?? "",
    );
    const callback = await new TestBrowser(app).request(`${link.pathname}${link.search}`);
    const target = new URL(callback.headers.get("Location") ?? "", WEB_ORIGIN);
    expect(target.pathname).toBe("/reset-password");
    const token = target.searchParams.get("token") ?? "";

    const reset = await new TestBrowser(app).request("/api/auth/reset-password", {
      method: "POST",
      body: { token, newPassword: "a brand new password" },
    });
    expect(reset.status).toBe(200);

    // Without the five-minute cache cookie, the old session is checked in the database.
    const stale = await app.request("/api/v1/me", {
      headers: { Cookie: browser.cookieHeader((name) => name.includes("session_data")) },
    });
    expect(stale.status).toBe(401);
    expect((await new TestBrowser(app).signIn(address)).status).toBe(401);
    expect(
      (await new TestBrowser(app).signIn(address, "a brand new password")).status,
    ).toBe(200);

    // The link works once.
    const again = await new TestBrowser(app).request("/api/auth/reset-password", {
      method: "POST",
      body: { token, newPassword: "yet another password" },
    });
    expect(again.status).toBe(400);
  });

  test("sign-in attempts are rate-limited per address, with Retry-After", async () => {
    const { app } = minimalApp({
      auth: { ...testConfig().auth, rateLimit: { max: 3, windowSeconds: 600 } },
    });
    const attacker = new TestBrowser(app, "203.0.113.77");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await attacker.signIn("someone@example.com", "guess")).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);

    const limited = await attacker.signIn("someone@example.com", "guess");
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);

    // Another address is unaffected.
    const bystander = new TestBrowser(app, "203.0.113.78");
    expect((await bystander.signIn("someone@example.com", "guess")).status).toBe(401);
  });

  test("auth requests from another site are refused", async () => {
    const { app } = minimalApp();
    const username = unique("csrf_");
    const response = await new TestBrowser(app).request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: {
        email: `${username}@example.com`,
        username,
        name: username,
        password: "correct horse battery",
      },
    });
    expect(response.status).toBe(403);
  });

  test("routes this product replaces are not exposed", async () => {
    const { app } = minimalApp();
    const browser = new TestBrowser(app);
    const username = unique("paths_");
    await browser.signUp({ email: `${username}@example.com`, username });

    const update = await browser.request("/api/auth/update-user", {
      method: "POST",
      body: { username: unique("sneaky_") },
    });
    expect(update.status).toBe(404);
    const remove = await browser.request("/api/auth/delete-user", {
      method: "POST",
      body: {},
    });
    expect(remove.status).toBe(404);
  });

  test("role is never accepted from the client", async () => {
    const { app } = minimalApp();
    const browser = new TestBrowser(app);
    const username = unique("climber_");
    const response = await browser.request("/api/auth/sign-up/email", {
      method: "POST",
      body: {
        email: `${username}@example.com`,
        username,
        name: username,
        password: "correct horse battery",
        role: "admin",
      },
    });
    const admins = await database.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.role, "admin"));
    expect(admins.map((user) => user.username)).not.toContain(username);
    if (response.ok) expect((await me(browser)).body?.role).toBe("user");
  });

  test("Google sign-in starts the redirect flow with this site's callback", async () => {
    const { app } = minimalApp({
      auth: {
        ...testConfig().auth,
        google: { clientId: "test-client.apps.googleusercontent.com", clientSecret: "x" },
      },
    });
    const response = await new TestBrowser(app).request("/api/auth/sign-in/social", {
      method: "POST",
      body: { provider: "google", callbackURL: "/papers" },
    });
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const target = new URL(url);
    expect(target.hostname).toBe("accounts.google.com");
    expect(target.searchParams.get("redirect_uri")).toBe(
      `${WEB_ORIGIN}/api/auth/callback/google`,
    );
    expect(target.searchParams.get("client_id")).toBe(
      "test-client.apps.googleusercontent.com",
    );
  });

  test("a user created by a provider gets a username from the email, and ADMIN_EMAILS applies", async () => {
    const taken = unique("grace");
    const { app } = minimalApp();
    await new TestBrowser(app).signUp({ email: `${taken}@example.com`, username: taken });

    const config = testConfig({
      auth: { ...testConfig().auth, adminEmails: [`${taken}@elsewhere.example`] },
      email: { driver: "log" },
    });
    const auth = createAuth({
      config,
      db: database.db,
      email: memoryEmailSender(),
      limiter: createRateLimiter(database.db),
      logger: silentLogger,
      runInBackground: () => {},
    });
    const context = await auth.$context;
    // As Google's callback does: a verified email, a name, no username.
    const user = await context.internalAdapter.createUser(
      { email: `${taken}@elsewhere.example`, name: "Grace Hopper", emailVerified: true },
      { method: "oauth", oauth: { providerId: "google" } },
    );
    const [row] = await database.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, user.id));
    expect(row?.username).toBe(`${taken}2`);
    expect(row?.role).toBe("admin");
    const profiles = await database.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, user.id));
    expect(profiles).toHaveLength(1);
  });
});
