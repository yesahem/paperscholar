/**
 * Quiz-mode rules (docs/specs/10-secondary-features.md §1) as plain constants,
 * with no schema library, so browser code can import them as
 * `@repo/shared/exams`. The request and response schemas are in http/exams.ts.
 */

/** Questions in one attempt. */
export const EXAM_QUESTION_COUNT = { min: 5, max: 30, default: 10 } as const;

/** Topics one attempt may draw from. */
export const EXAM_MAX_TOPICS = 10;

/** Answer options per question. */
export const EXAM_OPTION_COUNT = { min: 2, max: 6 } as const;

/** Time allowed per question; an attempt always gets at least the minimum. */
export const EXAM_SECONDS_PER_QUESTION = 90;
export const EXAM_MIN_DURATION_SECONDS = 600;

/** Attempts shown per page of the history. */
export const EXAM_ATTEMPTS_PAGE_SIZE = 20;

/** Where an attempt stands. Only a `submitted` attempt carries answers and explanations. */
export const EXAM_ATTEMPT_STATUSES = ["in_progress", "submitted", "expired"] as const;
export type ExamAttemptStatus = (typeof EXAM_ATTEMPT_STATUSES)[number];

/** Seconds allowed for an attempt of `questionCount` questions. */
export function examDurationSeconds(questionCount: number): number {
  return Math.max(EXAM_MIN_DURATION_SECONDS, questionCount * EXAM_SECONDS_PER_QUESTION);
}
