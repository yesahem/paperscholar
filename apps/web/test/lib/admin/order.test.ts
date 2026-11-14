import { describe, expect, test } from "bun:test";
import { moved } from "@/lib/admin/order";

describe("moved", () => {
  test("moves an item up or down, leaving the input alone", () => {
    const list = ["a", "b", "c"];
    expect(moved(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moved(list, 1, 1)).toEqual(["a", "c", "b"]);
    expect(list).toEqual(["a", "b", "c"]);
  });

  test("a move past either end, or of a missing index, changes nothing", () => {
    expect(moved(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moved(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moved(["a", "b"], 5, -1)).toEqual(["a", "b"]);
  });
});
