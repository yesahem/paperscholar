import { describe, expect, test } from "bun:test";
import { clampSplit, nextSplit, splitAtPointer } from "../../src/lib/resizable";

const bounds = { min: 25, max: 75 };

describe("resizable split", () => {
  test("arrow keys move by 5 within the bounds; Home and End jump", () => {
    expect(nextSplit(50, "ArrowLeft", bounds)).toBe(45);
    expect(nextSplit(50, "ArrowRight", bounds)).toBe(55);
    expect(nextSplit(27, "ArrowLeft", bounds)).toBe(25);
    expect(nextSplit(74, "ArrowDown", bounds)).toBe(75);
    expect(nextSplit(50, "Home", bounds)).toBe(25);
    expect(nextSplit(50, "End", bounds)).toBe(75);
    expect(nextSplit(50, "Enter", bounds)).toBeNull();
  });

  test("a pointer sets the split from its position, clamped", () => {
    expect(splitAtPointer(150, 100, 200, bounds)).toBe(25);
    expect(splitAtPointer(220, 100, 200, bounds)).toBe(60);
    expect(splitAtPointer(400, 100, 200, bounds)).toBe(75);
    expect(splitAtPointer(10, 0, 0, bounds)).toBe(25);
    expect(clampSplit(33.333, bounds)).toBe(33.3);
  });
});
