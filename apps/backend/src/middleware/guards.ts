import { hasRole, type Feature, type FeatureFlags, type Role } from "@repo/shared";
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

/**
 * Route guards (docs/specs/06-auth.md §6). Each runs after `session()`.
 * Plans and tiers do not exist: access depends only on sign-in, email
 * verification and role.
 */

/** `401 unauthenticated` without a signed-in user. */
export function requireAuth() {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!c.var.user) throw new AppError("unauthenticated");
    await next();
  });
}

/**
 * `403 email_not_verified` for an unverified user, on instances that verify
 * email addresses. Elsewhere it lets everyone through. Implies `requireAuth`.
 */
export function requireVerified(instanceVerifiesEmail: boolean) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user;
    if (!user) throw new AppError("unauthenticated");
    if (instanceVerifiesEmail && !user.emailVerified) {
      throw new AppError("email_not_verified");
    }
    await next();
  });
}

/**
 * `404 not_found` unless the user's role is at least `role`, so maintainer
 * and admin routes cannot be discovered. The role is read fresh through
 * `currentRole`, not from the session cookie, which may be minutes old.
 */
export function requireRole(
  role: Role,
  currentRole: (userId: string) => Promise<Role | null>,
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user;
    const actual = user ? await currentRole(user.id) : null;
    if (!actual || !hasRole(actual, role)) throw new AppError("not_found");
    await next();
  });
}

/** `404 not_found` when `feature` is off on this instance (docs/specs/13-self-hosting.md §4). */
export function requireFeature(features: FeatureFlags, feature: Feature) {
  return createMiddleware<AppEnv>(async (_c, next) => {
    if (!features[feature]) throw new AppError("not_found");
    await next();
  });
}
