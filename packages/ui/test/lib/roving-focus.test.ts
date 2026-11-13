import { describe, expect, test } from "bun:test";
import { nextRovingIndex } from "../../src/lib/roving-focus";

describe("nextRovingIndex", () => {
  test("arrow keys move and wrap around", () => {
    expect(nextRovingIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextRovingIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextRovingIndex(0, "ArrowLeft", 3)).toBe(2);
  });

  test("Home and End jump to the ends", () => {
    expect(nextRovingIndex(1, "Home", 3)).toBe(0);
    expect(nextRovingIndex(1, "End", 3)).toBe(2);
  });

  test("vertical lists use up and down, and ignore left and right", () => {
    expect(nextRovingIndex(0, "ArrowDown", 3, "vertical")).toBe(1);
    expect(nextRovingIndex(0, "ArrowUp", 3, "vertical")).toBe(2);
    expect(nextRovingIndex(0, "ArrowRight", 3, "vertical")).toBeNull();
  });

  test("other keys and empty lists do nothing", () => {
    expect(nextRovingIndex(0, "Enter", 3)).toBeNull();
    expect(nextRovingIndex(0, "ArrowRight", 0)).toBeNull();
  });
});
