import { describe, expect, test } from "bun:test";
import { utf8ByteLength } from "../src/submissions";

describe("utf8ByteLength", () => {
  test("matches TextEncoder for ASCII, accents, CJK, emoji and lone surrogates", () => {
    for (const text of [
      "",
      "def f():\n    return 1",
      "é",
      "数学",
      "∑ αβ",
      "😀x",
      "\ud800",
      "a\udc00b",
    ]) {
      expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
    }
  });
});
