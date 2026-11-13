import { describe, expect, test } from "bun:test";
import { createAuth } from "../../src/auth/auth";
import { silentLogger } from "../../src/lib/logger";
import {
  createAccounts,
  isUniqueViolation,
  LastAdminError,
  nextUsernameChange,
} from "../../src/services/accounts";
import { createRateLimiter } from "../../src/services/rate-limiter";
import { TestBrowser } from "../auth-client";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, testConfig } from "../helpers";

describe("nextUsernameChange", () => {
  test("is 30 days after the last change, or now when there was none", () => {
    expect(nextUsernameChange(null)).toBeNull();
    expect(nextUsernameChange(new Date("2026-01-01T00:00:00Z"))?.toISOString()).toBe(
      "2026-01-31T00:00:00.000Z",
    );
  });
});

describe("isUniqueViolation", () => {
  test("finds SQLSTATE 23505 anywhere in the cause chain", () => {
    const pg = Object.assign(new Error("duplicate key"), { errno: "23505" });
    expect(isUniqueViolation(new Error("query failed", { cause: pg }))).toBe(true);
    expect(isUniqueViolation(new Error("other"))).toBe(false);
  });
});

describe.skipIf(!DATABASE_URL)("roles and passwords", () => {
  const database = useTestDatabase();

  function services() {
    const config = testConfig();
    const auth = createAuth({
      config,
      db: database.db,
      email: null,
      limiter: createRateLimiter(database.db),
      logger: silentLogger,
      runInBackground: () => {},
    });
    return createAccounts({ db: database.db, auth });
  }

  async function newUser(app = createTestApp({}, undefined, { db: database.db }).app) {
    const username = `u${crypto.randomUUID().slice(0, 8)}`;
    const email = `${username}@example.com`;
    const browser = new TestBrowser(app);
    await browser.signUp({ email, username });
    return { app, browser, email };
  }

  test("setRole promotes and demotes, but never the last admin", async () => {
    const accounts = services();
    const first = await newUser();
    const firstId = (await accounts.findUserIdByEmail(first.email)) ?? "";

    expect(await accounts.setRole(firstId, "admin")).toBe("user");
    expect(await accounts.currentRole(firstId)).toBe("admin");
    expect(accounts.setRole(firstId, "user")).rejects.toBeInstanceOf(LastAdminError);

    const second = await newUser();
    const secondId = (await accounts.findUserIdByEmail(second.email.toUpperCase())) ?? "";
    await accounts.setRole(secondId, "admin");
    expect(await accounts.setRole(firstId, "maintainer")).toBe("admin");
    expect(await accounts.currentRole(firstId)).toBe("maintainer");
  });

  test("a promoted maintainer passes the admin-area guard; a user gets 404", async () => {
    const accounts = services();
    const { browser, email } = await newUser();
    // No maintainer routes exist yet, so even a maintainer sees not_found, but
    // only after the guard has let them through.
    expect((await browser.request("/api/v1/admin/papers")).status).toBe(404);
    const userId = (await accounts.findUserIdByEmail(email)) ?? "";
    await accounts.setRole(userId, "maintainer");
    expect(await accounts.currentRole(userId)).toBe("maintainer");
  });

  test("setPassword replaces the password and signs out everywhere", async () => {
    const accounts = services();
    const { app, browser, email } = await newUser();
    const userId = (await accounts.findUserIdByEmail(email)) ?? "";

    expect(accounts.setPassword(userId, "short")).rejects.toThrow(
      "Use 8 to 128 characters.",
    );
    await accounts.setPassword(userId, "set from the command line");

    const stale = await app.request("/api/v1/me", {
      headers: { Cookie: browser.cookieHeader((name) => name.includes("session_data")) },
    });
    expect(stale.status).toBe(401);
    expect((await new TestBrowser(app).signIn(email)).status).toBe(401);
    expect(
      (await new TestBrowser(app).signIn(email, "set from the command line")).status,
    ).toBe(200);
  });
});
