import { describe, expect, test } from "bun:test";
import { toCanonicalYaml } from "../src";

describe("toCanonicalYaml", () => {
  test("writes plain scalars and short flow lists", () => {
    expect(
      toCanonicalYaml([
        ["title", "Positional encoding"],
        ["year", 2017],
        ["tags", ["nlp", "attention"]],
      ]),
    ).toBe("title: Positional encoding\nyear: 2017\ntags: [nlp, attention]\n");
  });

  test("quotes strings YAML would misread, and they parse back unchanged", () => {
    const tricky = [
      "Adam: A Method",
      "yes",
      "2017",
      "- dash",
      "#hash",
      "trailing:",
      " padded",
      "a, b",
      "[x]",
      "§3.5",
      "Łukasz",
    ];
    for (const value of tricky) {
      const yaml = toCanonicalYaml([
        ["key", value],
        ["list", [value, "plain"]],
      ]);
      expect(Bun.YAML.parse(yaml)).toEqual({ key: value, list: [value, "plain"] });
    }
  });

  test("breaks long lists into one item per line", () => {
    const authors = Array.from({ length: 8 }, (_, index) => `Author Number ${index + 1}`);
    const yaml = toCanonicalYaml([["authors", authors]]);
    expect(yaml.split("\n")[1]).toBe("  - Author Number 1");
    expect(Bun.YAML.parse(yaml)).toEqual({ authors });
  });

  test("omits undefined values", () => {
    expect(
      toCanonicalYaml([
        ["a", "x"],
        ["b", undefined],
      ]),
    ).toBe("a: x\n");
  });
});
