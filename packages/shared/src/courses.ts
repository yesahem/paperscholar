/**
 * Course rules (docs/specs/10-secondary-features.md §5) as plain constants,
 * with no schema library, so browser code can import them as
 * `@repo/shared/courses`. The request and response schemas are in http/courses.ts.
 */

export const COURSE_ITEM_TYPES = ["lecture", "exercise"] as const;
export type CourseItemType = (typeof COURSE_ITEM_TYPES)[number];

/** Longest personal note on one course item. */
export const COURSE_NOTE_MAX_LENGTH = 10_000;

/** How long a video URL works. */
export const PLAYBACK_URL_SECONDS = 300;

/** The player asks for a fresh URL when the current one has this long left. */
export const PLAYBACK_REFRESH_MARGIN_SECONDS = 60;

/** Share of a lecture watched at which it counts as complete. */
export const LECTURE_COMPLETE_FRACTION = 0.9;
