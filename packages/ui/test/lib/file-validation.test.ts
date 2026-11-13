import { describe, expect, test } from "bun:test";
import {
  describeAccept,
  fileKey,
  matchesAccept,
  parseAccept,
  validateFiles,
} from "../../src/lib/file-validation";

const pdf = (name = "paper.pdf", size = 1_000) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });
const png = (name = "avatar.png") =>
  new File([new Uint8Array(10)], name, { type: "image/png" });

describe("parseAccept", () => {
  test("splits, trims and lowercases entries", () => {
    expect(parseAccept(" .PDF, application/pdf ,,image/*")).toEqual([
      ".pdf",
      "application/pdf",
      "image/*",
    ]);
  });

  test("treats a missing accept as accept-all", () => {
    expect(parseAccept(undefined)).toEqual([]);
    expect(matchesAccept(png(), [])).toBe(true);
  });
});

describe("matchesAccept", () => {
  test("matches by extension, exact MIME type and wildcard", () => {
    expect(matchesAccept(pdf(), [".pdf"])).toBe(true);
    expect(matchesAccept(pdf("PAPER.PDF"), [".pdf"])).toBe(true);
    expect(matchesAccept(pdf(), ["application/pdf"])).toBe(true);
    expect(matchesAccept(png(), ["image/*"])).toBe(true);
    expect(matchesAccept(png(), [".pdf", "application/pdf"])).toBe(false);
  });
});

describe("validateFiles", () => {
  test("rejects files of the wrong type", () => {
    const result = validateFiles([pdf(), png()], { accept: "application/pdf" });
    expect(result.accepted.map((f) => f.name)).toEqual(["paper.pdf"]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("type");
  });

  test("rejects files over the size limit with a readable message", () => {
    const result = validateFiles([pdf("big.pdf", 2048)], { maxSizeBytes: 1024 });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("size");
    expect(result.rejected[0]?.message).toBe("big.pdf is larger than 1 KB.");
  });

  test("keeps files up to the count limit, in order", () => {
    const result = validateFiles([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")], {
      maxFiles: 2,
    });
    expect(result.accepted.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(result.rejected.map((r) => r.reason)).toEqual(["count"]);
  });

  test("uses a singular message when only one file is allowed", () => {
    const result = validateFiles([pdf("a.pdf"), pdf("b.pdf")], { maxFiles: 1 });
    expect(result.rejected[0]?.message).toBe("Only one file can be added.");
  });
});

describe("describeAccept", () => {
  test("produces short labels without duplicates", () => {
    expect(describeAccept(".pdf,application/pdf")).toBe("PDF");
    expect(describeAccept("image/*")).toBe("Images");
    expect(describeAccept("image/png,image/webp")).toBe("PNG, WEBP");
    expect(describeAccept(undefined)).toBeUndefined();
  });
});

describe("fileKey", () => {
  test("identifies the same file picked twice", () => {
    const file = pdf();
    expect(fileKey(file)).toBe(fileKey(file));
    expect(fileKey(pdf("other.pdf"))).not.toBe(fileKey(file));
  });
});
