/**
 * Cold-mail rules (docs/specs/10-secondary-features.md §6) as plain
 * constants, with no schema library, so browser code can import them as
 * `@repo/shared/cold-mail`. The request and response schemas are in
 * http/cold-mail.ts.
 */

/** Largest CV accepted, and most pages. */
export const CV_MAX_BYTES = 4 * 1024 * 1024;
export const CV_MAX_PAGES = 10;
/** CVs kept per user; uploading another replaces the oldest. */
export const CV_MAX_PER_USER = 3;
export const CV_ACCEPT = "application/pdf";

export const COLD_MAIL_TARGET_TYPES = ["company", "professor"] as const;
export type ColdMailTargetType = (typeof COLD_MAIL_TARGET_TYPES)[number];

export const COLD_MAIL_TONES = ["formal", "friendly"] as const;
export type ColdMailTone = (typeof COLD_MAIL_TONES)[number];

/** A generation is pending until the model answers; failed ones do not count against the limit. */
export const COLD_MAIL_STATUSES = ["pending", "done", "failed"] as const;
export type ColdMailStatus = (typeof COLD_MAIL_STATUSES)[number];

export const COLD_MAIL_NOTES_MAX_LENGTH = 2000;
export const COLD_MAIL_NAME_MAX_LENGTH = 120;
export const COLD_MAIL_ORGANISATION_MAX_LENGTH = 160;
export const COLD_MAIL_ROLE_MAX_LENGTH = 120;

/** How often the page asks whether a generation has finished. */
export const COLD_MAIL_POLL_MS = 2_000;

/** Items per page of the history. */
export const COLD_MAIL_PAGE_SIZE = 20;
