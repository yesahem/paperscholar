import { describe, expect, test } from "bun:test";
import { parseArxivReference } from "../src/arxiv";

describe("parseArxivReference", () => {
  test("accepts every form people paste and returns the bare identifier", () => {
    for (const input of [
      "1706.03762",
      "  1706.03762  ",
      "1706.03762v5",
      "arxiv:1706.03762",
      "arXiv:1706.03762v5",
      "arXiv: 1706.03762",
      "https://arxiv.org/abs/1706.03762",
      "http://arxiv.org/abs/1706.03762v7",
      "https://arxiv.org/abs/1706.03762v7?context=cs",
      "https://arxiv.org/abs/1706.03762#section",
      "https://www.arxiv.org/pdf/1706.03762v5.pdf",
      "https://export.arxiv.org/abs/1706.03762",
      "https://arxiv.org/html/1706.03762v7",
      "arxiv.org/pdf/1706.03762.pdf",
      "www.arxiv.org/abs/1706.03762",
      "HTTPS://ARXIV.ORG/abs/1706.03762",
    ]) {
      expect(parseArxivReference(input)).toBe("1706.03762");
    }
  });

  test("reads old-style identifiers", () => {
    expect(parseArxivReference("hep-th/9901001")).toBe("hep-th/9901001");
    expect(parseArxivReference("math.GT/0309136v2")).toBe("math.GT/0309136");
    expect(parseArxivReference("https://arxiv.org/abs/cond-mat/0001001")).toBe(
      "cond-mat/0001001",
    );
  });

  test("reads five-digit identifiers", () => {
    expect(parseArxivReference("2401.12345v2")).toBe("2401.12345");
  });

  test("refuses other hosts, lookalikes, paths and junk", () => {
    for (const input of [
      "",
      "   ",
      "1706.037",
      "17060.03762",
      "../etc/passwd",
      "https://evil.example/abs/1706.03762",
      "https://arxiv.org.evil.example/abs/1706.03762",
      "https://evilarxiv.org/abs/1706.03762",
      "https://user:secret@arxiv.org/abs/1706.03762",
      "https://arxiv.org:8443/abs/1706.03762",
      "https://arxiv.org/list/cs.LG/recent",
      "https://arxiv.org/abs/1706.03762/../../x",
      "https://arxiv.org/abs/1706.03762%2f..",
      "ftp://arxiv.org/abs/1706.03762",
      "javascript:alert(1)",
      "1706.03762 and more",
      "x".repeat(400),
    ]) {
      expect(parseArxivReference(input)).toBeNull();
    }
  });
});
