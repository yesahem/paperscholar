import { describe, expect, test } from "bun:test";
import { formatDuration, humaniseTestName } from "../../src/results/format";

describe("humaniseTestName", () => {
  test("turns a test name into words", () => {
    expect(humaniseTestName("test_output_has_shape")).toBe("output has shape");
    expect(humaniseTestName("rows_sum_to_one")).toBe("rows sum to one");
  });
});

describe("formatDuration", () => {
  test("uses milliseconds under a second, seconds above, nothing when unknown", () => {
    expect(formatDuration(340)).toBe("340 ms");
    expect(formatDuration(1234)).toBe("1.2 s");
    expect(formatDuration(null)).toBe("");
  });
});
