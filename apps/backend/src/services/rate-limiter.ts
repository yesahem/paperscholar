import { schema, sql, type Database } from "@repo/db";

export interface RateLimitRule {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Requests allowed per window. */
  max: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets; null when allowed. */
  retryAfterSeconds: number | null;
}

export interface RateLimiter {
  /** Counts one request against `key` and says whether it is within `rule`. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}

/** Start of the fixed window containing `nowMs`. */
export function windowStart(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

/**
 * Fixed-window counters in Postgres (docs/specs/11-security-ops.md §3): one
 * upsert per request, returning the new count, so concurrent requests on any
 * number of instances are counted exactly.
 */
export function createRateLimiter(
  db: Database,
  now: () => number = Date.now,
): RateLimiter {
  const counters = schema.rateLimitCounters;
  return {
    async consume(key, { windowSeconds, max }) {
      const nowMs = now();
      const startMs = windowStart(nowMs, windowSeconds);
      const [row] = await db
        .insert(counters)
        .values({ key, windowStart: new Date(startMs), count: 1 })
        .onConflictDoUpdate({
          target: [counters.key, counters.windowStart],
          set: { count: sql`${counters.count} + 1` },
        })
        .returning({ count: counters.count });
      const count = row?.count ?? 1;
      if (count <= max) return { allowed: true, retryAfterSeconds: null };
      const resetMs = startMs + windowSeconds * 1000;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetMs - nowMs) / 1000)),
      };
    },
  };
}
