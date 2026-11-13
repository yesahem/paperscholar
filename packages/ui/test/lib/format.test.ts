import { describe, expect, test } from "bun:test";
import { formatBytes } from "../../src/lib/format";

describe("formatBytes", () => {
  test("formats across units with sensible precision", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(30 * 1024 * 1024)).toBe("30 MB");
    expect(formatBytes(2.25 * 1024 ** 3)).toBe("2.3 GB");
  });

  test("rejects negative and non-finite input", () => {
    expect(() => formatBytes(-1)).toThrow(RangeError);
    expect(() => formatBytes(Number.NaN)).toThrow(RangeError);
  });
});
