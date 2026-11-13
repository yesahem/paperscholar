/**
 * The colour theme. It follows the operating system until the user picks one
 * (docs/specs/08-web.md §4); the choice is kept in localStorage and applied as
 * `<html data-theme>`, which the design tokens in @repo/ui read.
 */

export const THEME_STORAGE_KEY = "theme";
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Runs in <head> before the page paints, so a saved theme never flashes the
 * other one. Kept tiny and dependency-free; it is inlined as a string.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})();`;
