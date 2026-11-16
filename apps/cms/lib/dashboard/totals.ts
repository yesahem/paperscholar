import type { Dashboard } from "@repo/shared";

export interface UsageTotals {
  ingestions: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  sandboxRuns: number;
}

/** The sum of the dashboard's daily rows (docs/specs/14-cms.md §8.1). */
export function totalUsage(daily: Dashboard["daily"]): UsageTotals {
  const totals: UsageTotals = {
    ingestions: 0,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    sandboxRuns: 0,
  };
  for (const day of daily) {
    totals.ingestions += day.ingestions;
    totals.calls += day.calls;
    totals.inputTokens += day.inputTokens;
    totals.outputTokens += day.outputTokens;
    totals.cacheReadTokens += day.cacheReadTokens;
    totals.sandboxRuns += day.sandboxRuns;
  }
  return totals;
}

/** The share of input read from the cache: cache reads over all input, or null with none. */
export function cacheHitShare(totals: UsageTotals): number | null {
  const input = totals.inputTokens + totals.cacheReadTokens;
  return input === 0 ? null : totals.cacheReadTokens / input;
}
