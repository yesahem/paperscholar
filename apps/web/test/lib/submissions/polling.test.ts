import { describe, expect, test } from "bun:test";
import { nextPollDelayMs, POLL_GIVE_UP_MS } from "@/lib/submissions/polling";

describe("nextPollDelayMs", () => {
  test("every second for ten seconds, then every two, then gives up at 120 s", () => {
    expect(nextPollDelayMs(0)).toBe(1000);
    expect(nextPollDelayMs(9_999)).toBe(1000);
    expect(nextPollDelayMs(10_000)).toBe(2000);
    expect(nextPollDelayMs(POLL_GIVE_UP_MS - 1)).toBe(2000);
    expect(nextPollDelayMs(POLL_GIVE_UP_MS)).toBeNull();
  });
});
