import { describe, expect, test } from "bun:test";
import { createRateLimiter, windowStart } from "../../src/services/rate-limiter";
import { DATABASE_URL, useTestDatabase } from "../database";

describe("windowStart", () => {
  test("rounds down to the window", () => {
    expect(windowStart(1_234_567, 60)).toBe(1_200_000);
    expect(windowStart(1_200_000, 60)).toBe(1_200_000);
  });
});

describe.skipIf(!DATABASE_URL)("createRateLimiter", () => {
  const database = useTestDatabase();
  const rule = { windowSeconds: 60, max: 5 };

  test("counts concurrent requests exactly", async () => {
    const limiter = createRateLimiter(database.db);
    const key = `concurrent:${crypto.randomUUID()}`;
    const decisions = await Promise.all(
      Array.from({ length: 12 }, () => limiter.consume(key, rule)),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
  });

  test("says when to retry, and resets with the next window", async () => {
    let now = 1_800_000_000_000 + 15_000;
    const limiter = createRateLimiter(database.db, () => now);
    const key = `window:${crypto.randomUUID()}`;
    for (let index = 0; index < 5; index += 1) await limiter.consume(key, rule);

    expect(await limiter.consume(key, rule)).toEqual({
      allowed: false,
      retryAfterSeconds: 45,
    });
    now += 45_000;
    expect((await limiter.consume(key, rule)).allowed).toBe(true);
  });

  test("keys are independent", async () => {
    const limiter = createRateLimiter(database.db);
    const one = `one:${crypto.randomUUID()}`;
    for (let index = 0; index < 6; index += 1) await limiter.consume(one, rule);
    expect((await limiter.consume(`two:${crypto.randomUUID()}`, rule)).allowed).toBe(
      true,
    );
  });
});
