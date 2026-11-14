/**
 * Progress, profile and leaderboard vocabulary as plain constants, with no
 * schema library, so browser code can import it cheaply as
 * `@repo/shared/progress`. The zod schemas are in http/progress.ts.
 * Spec: docs/specs/05-api.md §7.
 */

/** Sort orders of `GET /v1/leaderboard`. */
export const LEADERBOARD_SORTS = [
  "problems_solved",
  "papers_completed",
  "recent_activity",
] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];

/** Default and largest leaderboard page (docs/specs/08-web.md §6 shows 50 per page). */
export const LEADERBOARD_PAGE_SIZE = 50;
export const LEADERBOARD_MAX_PAGE_SIZE = 100;

/** `GET /v1/users?q=`: shortest query and most results. */
export const USER_SEARCH_MIN_LENGTH = 2;
export const USER_SEARCH_LIMIT = 10;

/** Days of activity a public profile returns, ending today (UTC). */
export const ACTIVITY_DAYS = 365;

/** Avatar uploads (docs/specs/11-security-ops.md §4). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** Stored avatars are WebP, at most this many pixels on each side. */
export const AVATAR_SIZE_PX = 256;
/** What the upload accepts, by file signature; also the picker's `accept`. */
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
