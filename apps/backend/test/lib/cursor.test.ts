import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor } from "../../src/lib/cursor";

describe("cursors", () => {
  test("round-trip, and anything else is a validation error", () => {
    const id = "01890a5d-ac96-774b-bcce-b302099a8057";
    const at = new Date("2026-11-14T10:00:00.123Z");
    expect(decodeCursor(encodeCursor(at, id))).toEqual({ at, id });
    for (const bad of [
      "garbage",
      Buffer.from('["x","y"]').toString("base64url"),
      Buffer.from(`["2026-01-01","not-uuid"]`).toString("base64url"),
    ]) {
      expect(() => decodeCursor(bad)).toThrow("The request is invalid.");
    }
  });
});
