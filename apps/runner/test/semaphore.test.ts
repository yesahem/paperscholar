import { describe, expect, test } from "bun:test";
import { QueueFullError, Semaphore } from "../src/semaphore";

function gate() {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

describe("Semaphore", () => {
  test("runs at most `max` tasks at once, in arrival order", async () => {
    const slots = new Semaphore(1, 5);
    const order: string[] = [];
    const first = gate();
    const a = slots.use(async () => {
      order.push("a start");
      await first.promise;
      order.push("a end");
    });
    const b = slots.use(async () => {
      order.push("b");
    });
    await Bun.sleep(1);
    expect(slots.running).toBe(1);
    expect(slots.queued).toBe(1);
    first.open();
    await Promise.all([a, b]);
    expect(order).toEqual(["a start", "a end", "b"]);
    expect(slots.running).toBe(0);
  });

  test("refuses beyond the queue, and a waiter that aborts leaves it", async () => {
    const slots = new Semaphore(1, 1);
    const hold = gate();
    const running = slots.use(() => hold.promise);
    const controller = new AbortController();
    const waiting = slots.use(async () => "ran", controller.signal);
    await expect(slots.use(async () => "x")).rejects.toBeInstanceOf(QueueFullError);
    controller.abort();
    await expect(waiting).rejects.toBeDefined();
    expect(slots.queued).toBe(0);
    hold.open();
    await running;
    expect(await slots.use(async () => "free")).toBe("free");
  });

  test("a failing task releases its slot", async () => {
    const slots = new Semaphore(1, 0);
    await expect(slots.use(() => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    expect(await slots.use(async () => 1)).toBe(1);
  });
});
