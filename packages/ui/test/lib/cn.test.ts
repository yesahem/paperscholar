import { expect, test } from "bun:test";
import { cn } from "../../src/lib/cn";

test("later classes override conflicting earlier ones", () => {
  expect(cn("px-4 py-2", "px-6")).toBe("py-2 px-6");
});

test("falsy values are skipped", () => {
  const hidden: boolean = Date.now() < 0;
  expect(cn("p-2", hidden && "hidden", undefined, null)).toBe("p-2");
});
