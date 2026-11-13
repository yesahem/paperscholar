/**
 * Account rules as plain constants and functions, with no schema library, so
 * browser code can import them cheaply as `@repo/shared/accounts`. The zod
 * schemas built from them are in http/me.ts. Spec: docs/specs/06-auth.md §1, §3, §9.
 */

/** Ordered from least to most privileged (docs/specs/06-auth.md §6). */
export const ROLES = ["user", "maintainer", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** True when `role` is at least `required`. */
export function hasRole(role: Role, required: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(required);
}

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
/** Lowercase letters, digits and underscores. Usernames are stored lowercase. */
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/** A username may change at most once in this many days (docs/specs/06-auth.md §3). */
export const USERNAME_CHANGE_INTERVAL_DAYS = 30;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Longest profile bio, in characters (docs/specs/04-database.md §4). */
export const BIO_MAX_LENGTH = 280;

/**
 * Names nobody can take: route names, and names that could pass for the
 * project or its staff. Compared after lowercasing.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "about",
  "account",
  "accounts",
  "admin",
  "administrator",
  "api",
  "auth",
  "billing",
  "contact",
  "courses",
  "dashboard",
  "help",
  "interview",
  "jobs",
  "leaderboard",
  "login",
  "logout",
  "maintainer",
  "maintainers",
  "me",
  "mod",
  "moderator",
  "null",
  "official",
  "papers",
  "paperscholar",
  "privacy",
  "professors",
  "profile",
  "roadmap",
  "root",
  "security",
  "settings",
  "signin",
  "signout",
  "signup",
  "staff",
  "support",
  "system",
  "team",
  "terms",
  "test",
  "undefined",
  "user",
  "users",
]);

/**
 * Why `username` cannot be used, or null when it can. Expects the lowercased
 * form. Uniqueness is checked by the server.
 */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN_LENGTH)
    return `Use at least ${USERNAME_MIN_LENGTH} characters.`;
  if (username.length > USERNAME_MAX_LENGTH)
    return `Use at most ${USERNAME_MAX_LENGTH} characters.`;
  if (!USERNAME_PATTERN.test(username))
    return "Use only letters, digits and underscores.";
  if (RESERVED_USERNAMES.has(username)) return "That username is reserved.";
  return null;
}

/** Usernames are case-insensitive and stored lowercase. */
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}
