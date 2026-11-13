import { describe, expect, test } from "bun:test";
import { parseThemePreference, THEME_INIT_SCRIPT } from "@/lib/theme";

describe("theme", () => {
  test("anything but light or dark means following the system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("blue")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  test("the inline script parses and guards storage access", () => {
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
    expect(THEME_INIT_SCRIPT).toContain("try{");
  });
});
