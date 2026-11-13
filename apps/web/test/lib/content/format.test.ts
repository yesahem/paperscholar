import { describe, expect, test } from "bun:test";
import {
  formatAuthors,
  formatTag,
  humaniseTestName,
  pluralise,
} from "@/lib/content/format";

describe("format", () => {
  test("authors: every name up to three, then a count", () => {
    expect(formatAuthors([])).toBe("Unknown authors");
    expect(formatAuthors(["Kingma"])).toBe("Kingma");
    expect(formatAuthors(["Kingma", "Ba"])).toBe("Kingma and Ba");
    expect(formatAuthors(["A", "B", "C"])).toBe("A, B and C");
    expect(formatAuthors(["A", "B", "C", "D"])).toBe("A, B and 2 others");
  });

  test("pluralises", () => {
    expect(pluralise(1, "problem")).toBe("1 problem");
    expect(pluralise(0, "problem")).toBe("0 problems");
  });

  test("turns test names and tags into words", () => {
    expect(humaniseTestName("test_output_has_shape")).toBe("output has shape");
    expect(formatTag("deep-learning")).toBe("deep learning");
  });
});
