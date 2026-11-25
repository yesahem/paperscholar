import {
  LECTURE_COMPLETE_FRACTION,
  PLAYBACK_REFRESH_MARGIN_SECONDS,
} from "@repo/shared/courses";

/**
 * Rules of the lecture player (docs/specs/10-secondary-features.md §5): fetch
 * a fresh URL before the old one expires, resume where the learner left off,
 * count a lecture as complete at 90% watched.
 */

/** How often the player reports its position while playing. */
export const PROGRESS_REPORT_INTERVAL_MS = 15_000;

/** Seconds from the end within which a lecture restarts instead of resuming. */
const RESTART_WITHIN_SECONDS = 5;

/** Whether a URL fetched at `fetchedAtMs` should be replaced now. */
export function needsFreshUrl(
  fetchedAtMs: number,
  nowMs: number,
  expiresInSeconds: number,
  marginSeconds: number = PLAYBACK_REFRESH_MARGIN_SECONDS,
): boolean {
  return nowMs - fetchedAtMs >= (expiresInSeconds - marginSeconds) * 1000;
}

/** Where to start playing: the saved position, or the start once nearly finished. */
export function resumeFrom(lastWatchedSeconds: number, durationSeconds: number): number {
  if (lastWatchedSeconds <= 0) return 0;
  return lastWatchedSeconds >= durationSeconds - RESTART_WITHIN_SECONDS
    ? 0
    : lastWatchedSeconds;
}

/** Whether `positionSeconds` is far enough into the lecture to complete it. */
export function watchedEnough(positionSeconds: number, durationSeconds: number): boolean {
  return (
    durationSeconds > 0 && positionSeconds >= durationSeconds * LECTURE_COMPLETE_FRACTION
  );
}

/** "9 min", "1 h 05 min"; under a minute rounds up to "1 min". */
export function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** Completed items of a course, and how many there are. */
export function completion(
  itemIds: readonly string[],
  progress: readonly { itemId: string; completed: boolean }[],
): { done: number; total: number } {
  const completed = new Set(
    progress.filter((item) => item.completed).map((item) => item.itemId),
  );
  return {
    done: itemIds.filter((id) => completed.has(id)).length,
    total: itemIds.length,
  };
}
