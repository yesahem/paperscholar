/**
 * When to ask again for a submission's result (docs/specs/07-runner.md §3):
 * every second for the first ten seconds, then every two, giving up after 120.
 */
export const POLL_GIVE_UP_MS = 120_000;
const FAST_PHASE_MS = 10_000;

/** Delay before the next poll, or null to stop and report "taking too long". */
export function nextPollDelayMs(elapsedMs: number): number | null {
  if (elapsedMs >= POLL_GIVE_UP_MS) return null;
  return elapsedMs < FAST_PHASE_MS ? 1000 : 2000;
}
