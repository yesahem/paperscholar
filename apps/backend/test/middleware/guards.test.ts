import type { FeatureFlags, Role } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AuthUser } from "../../src/auth/auth";
import { silentLogger } from "@repo/shared/logger";
import { createErrorHandler } from "../../src/middleware/error-handler";
import {
  requireAuth,
  requireFeature,
  requireRole,
  requireVerified,
} from "../../src/middleware/guards";
import type { AppEnv } from "../../src/types";

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    name: "ada",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    username: "ada",
    role: "user",
    ...overrides,
  };
}

/** A tiny app with `signedIn` as the session and `guard` in front of GET /. */
function guarded(
  signedIn: AuthUser | null,
  guard: ReturnType<typeof requireAuth>,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.onError(createErrorHandler(silentLogger));
  app.use(async (c, next) => {
    c.set("requestId", "test");
    c.set("logger", silentLogger);
    c.set("user", signedIn);
    c.set("session", null);
    await next();
  });
  app.get("/", guard, (c) => c.text("ok"));
  return app;
}

async function codeOf(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe("requireAuth", () => {
  test("401 without a user, through with one", async () => {
    const denied = await guarded(null, requireAuth()).request("/");
    expect(denied.status).toBe(401);
    expect(await codeOf(denied)).toBe("unauthenticated");
    expect((await guarded(user(), requireAuth()).request("/")).status).toBe(200);
  });
});

describe("requireVerified", () => {
  test("403 email_not_verified for an unverified user when the instance verifies", async () => {
    const response = await guarded(
      user({ emailVerified: false }),
      requireVerified(true),
    ).request("/");
    expect(response.status).toBe(403);
    expect(await codeOf(response)).toBe("email_not_verified");
  });

  test("lets unverified users through when the instance does not verify", async () => {
    const response = await guarded(
      user({ emailVerified: false }),
      requireVerified(false),
    ).request("/");
    expect(response.status).toBe(200);
  });

  test("still needs a user", async () => {
    expect((await guarded(null, requireVerified(false)).request("/")).status).toBe(401);
  });
});

describe("requireRole", () => {
  const roles = (role: Role | null) => async () => role;

  test("404 for anyone below the role, so the route cannot be discovered", async () => {
    for (const [signedIn, stored] of [
      [null, null],
      [user(), "user"],
      [user(), null],
    ] as const) {
      const response = await guarded(
        signedIn,
        requireRole("maintainer", roles(stored)),
      ).request("/");
      expect(response.status).toBe(404);
      expect(await codeOf(response)).toBe("not_found");
    }
  });

  test("uses the stored role, not the one in the session", async () => {
    const demoted = guarded(user({ role: "admin" }), requireRole("admin", roles("user")));
    expect((await demoted.request("/")).status).toBe(404);
  });

  test("lets the role and those above it through", async () => {
    for (const stored of ["maintainer", "admin"] as const) {
      const response = await guarded(
        user(),
        requireRole("maintainer", roles(stored)),
      ).request("/");
      expect(response.status).toBe(200);
    }
  });
});

describe("requireFeature", () => {
  const features = (on: boolean): FeatureFlags => ({
    pipeline: on,
    coldMail: false,
    interview: false,
    courses: false,
    listings: false,
    googleSignIn: false,
    emailVerification: false,
    passwordReset: false,
    signups: true,
  });

  test("404 when the feature is off on this instance", async () => {
    const off = await guarded(
      user(),
      requireFeature(features(false), "pipeline"),
    ).request("/");
    expect(off.status).toBe(404);
    const on = await guarded(user(), requireFeature(features(true), "pipeline")).request(
      "/",
    );
    expect(on.status).toBe(200);
  });
});
