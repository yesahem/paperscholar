import { afterAll, describe, expect, test } from "bun:test";
import { closeDb, createAdvisoryLock, createDb } from "../src";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("createAdvisoryLock", () => {
  // Two separate clients, as two serverless instances would have.
  const first = createDb({ url: url ?? "", maxConnections: 2 });
  const second = createDb({ url: url ?? "", maxConnections: 2 });

  afterAll(async () => {
    await Promise.all([closeDb(first), closeDb(second)]);
  });

  test("tasks holding the same lock never overlap, across clients", async () => {
    const name = `test-lock-${crypto.randomUUID()}`;
    const events: string[] = [];
    const task = (label: string) => async () => {
      events.push(`${label}:start`);
      await Bun.sleep(100);
      events.push(`${label}:end`);
      return label;
    };

    const results = await Promise.all([
      createAdvisoryLock(first, name).withLock(task("a")),
      createAdvisoryLock(second, name).withLock(task("b")),
    ]);

    expect(results.sort()).toEqual(["a", "b"]);
    expect(events[1]).toEndWith(":end");
    expect(events[0]?.split(":")[0]).toBe(events[1]?.split(":")[0] ?? "");
  });

  test("a failing task releases the lock", async () => {
    const lock = createAdvisoryLock(first, `test-lock-${crypto.randomUUID()}`);
    expect(
      lock.withLock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await lock.withLock(async () => "after")).toBe("after");
  });
});
