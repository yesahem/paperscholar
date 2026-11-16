import { describe, expect, test } from "bun:test";
import { eq, schema } from "@repo/db";
import { TestBrowser, WEB_ORIGIN } from "../auth-client";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, testConfig } from "../helpers";

const CMS_ORIGIN = "http://localhost:3001";

describe.skipIf(!DATABASE_URL)("signing in to the CMS", () => {
  const database = useTestDatabase();

  function setup(cmsOrigin: string | null = CMS_ORIGIN) {
    const { app } = createTestApp(testConfig({ cmsOrigin }), undefined, {
      db: database.db,
    });
    return app;
  }

  /** An account made on the learner site, with `role`. */
  async function account(
    app: ReturnType<typeof setup>,
    role: "user" | "maintainer" | "admin",
  ) {
    const username = `cms${role.slice(0, 2)}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const email = `${username}@example.com`;
    const site = new TestBrowser(app);
    expect((await site.signUp({ email, username })).status).toBe(200);
    await database.db
      .update(schema.user)
      .set({ role })
      .where(eq(schema.user.username, username));
    return { email, username };
  }

  test("a maintainer and an admin sign in and use the admin API from the CMS origin", async () => {
    const app = setup();
    for (const role of ["maintainer", "admin"] as const) {
      const { email } = await account(app, role);
      const cms = new TestBrowser(app, undefined, CMS_ORIGIN);
      const response = await cms.signIn(email);
      expect(response.status).toBe(200);
      expect(cms.cookieHeader()).toContain("paperscholar.session_token=");
      expect((await cms.request("/api/v1/admin/papers")).status).toBe(200);
    }
  });

  test("a learner is refused with the wrong-password answer, and gets no cookie", async () => {
    const app = setup();
    const { email } = await account(app, "user");

    const cms = new TestBrowser(app, undefined, CMS_ORIGIN);
    const refused = await cms.signIn(email);
    const wrongPassword = await new TestBrowser(app, undefined, CMS_ORIGIN).signIn(
      email,
      "not the password at all",
    );
    expect(refused.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(await refused.json()).toEqual(await wrongPassword.json());
    expect(cms.cookies.size).toBe(0);

    // The same account signs in on the learner site.
    const site = new TestBrowser(app);
    expect((await site.signIn(email)).status).toBe(200);
    expect((await site.request("/api/v1/admin/papers")).status).toBe(404);
  });

  test("an account cannot be created from the CMS", async () => {
    const app = setup();
    const cms = new TestBrowser(app, undefined, CMS_ORIGIN);
    const username = `cmsnew${Date.now().toString(36)}`;
    const response = await cms.signUp({ email: `${username}@example.com`, username });
    expect(response.status).toBe(401);
    expect(cms.cookies.size).toBe(0);
  });

  test("a demoted maintainer loses the admin API at once", async () => {
    const app = setup();
    const { email, username } = await account(app, "maintainer");
    const cms = new TestBrowser(app, undefined, CMS_ORIGIN);
    expect((await cms.signIn(email)).status).toBe(200);
    await database.db
      .update(schema.user)
      .set({ role: "user" })
      .where(eq(schema.user.username, username));
    expect((await cms.request("/api/v1/admin/papers")).status).toBe(404);
  });

  test("an origin that is neither the site nor the CMS is refused", async () => {
    const app = setup();
    const { email } = await account(app, "maintainer");
    const stranger = new TestBrowser(app, undefined, "https://evil.example");
    expect((await stranger.signIn(email)).status).toBe(403);
  });

  test("without a CMS origin, the CMS origin is not trusted", async () => {
    const app = setup(null);
    const { email } = await account(app, "maintainer");
    const cms = new TestBrowser(app, undefined, CMS_ORIGIN);
    expect((await cms.signIn(email)).status).toBe(403);
    expect((await new TestBrowser(app, undefined, WEB_ORIGIN).signIn(email)).status).toBe(
      200,
    );
  });
});
