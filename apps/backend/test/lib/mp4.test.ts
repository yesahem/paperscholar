import { describe, expect, test } from "bun:test";
import { looksLikeMp4 } from "../../src/lib/mp4";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("looksLikeMp4", () => {
  test("accepts a file that starts with an ftyp box", () => {
    expect(
      looksLikeMp4(new Uint8Array([0, 0, 0, 24, ...bytes("ftypisom"), 0, 0, 2, 0])),
    ).toBe(true);
  });

  test("refuses other files, however they are named", () => {
    expect(looksLikeMp4(bytes("%PDF-1.4 not a video"))).toBe(false);
    expect(
      looksLikeMp4(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toBe(false);
    expect(looksLikeMp4(new Uint8Array([0, 0, 0, 24, ...bytes("ftyp")]))).toBe(false);
  });
});
