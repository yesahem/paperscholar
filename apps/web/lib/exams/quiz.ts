import type { ExamAttemptStatus } from "@repo/shared/exams";

/**
 * Quiz helpers for the /test page (docs/specs/10-secondary-features.md §1).
 * The server grades; these only shape what the page shows and sends.
 */

/** The page submits this long before the deadline, so the request lands in time. */
export const AUTO_SUBMIT_MARGIN_MS = 3_000;

/** Milliseconds left until `expiresAt`, never negative. */
export function remainingMs(expiresAt: string, now: number): number {
  return Math.max(0, Date.parse(expiresAt) - now);
}

/** `mm:ss`, or `h:mm:ss` past an hour. Partial seconds round up, so 0:00 means time is up. */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** The request body's answers: the chosen option per question, null where none was chosen. */
export function answersFor(
  questionCount: number,
  choices: ReadonlyMap<number, number>,
): (number | null)[] {
  return Array.from({ length: questionCount }, (_, index) => choices.get(index) ?? null);
}

/** "7 of 10 (70%)". */
export function scoreSummary(score: number, total: number): string {
  const percent = total === 0 ? 0 : Math.round((score / total) * 100);
  return `${score} of ${total} (${percent}%)`;
}

export const ATTEMPT_STATUS_LABEL: Record<ExamAttemptStatus, string> = {
  in_progress: "In progress",
  submitted: "Graded",
  expired: "Ran out of time",
};

/** Question counts offered when starting a quiz, within the API's limits. */
export const QUESTION_COUNT_CHOICES = [5, 10, 15, 20, 30] as const;
