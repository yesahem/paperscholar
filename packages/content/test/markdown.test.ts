import { describe, expect, test } from "bun:test";
import { findRawHtml } from "../src";

describe("findRawHtml", () => {
  test("finds tags and comments with their line numbers", () => {
    expect(findRawHtml("Intro\n<b>bold</b>\n<!-- note -->\n")).toEqual([
      { line: 2, html: "<b>" },
      { line: 2, html: "</b>" },
      { line: 3, html: "<!--" },
    ]);
  });

  test("ignores code blocks, inline code and maths", () => {
    const markdown = [
      "Compare $i < n$ and $$a<b>c$$.",
      "Use `List<int>` here.",
      "```python",
      "x = '<div>'",
      "```",
      "A plain < sign is fine.",
    ].join("\n");
    expect(findRawHtml(markdown)).toEqual([]);
  });
});
