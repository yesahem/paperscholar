"use client";

import { useSyncExternalStore } from "react";
import {
  parseThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

const listeners = new Set<() => void>();
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return parseThemePreference(document.documentElement.dataset.theme);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", listener);
  };
}

/** Saves and applies a preference, and notifies every subscriber. */
export function setThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The choice still applies to this page; it just is not remembered.
  }
  for (const listener of listeners) listener();
}

/** The user's choice; "system" on the server and before hydration. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => "system");
}

/** The theme actually shown, resolving "system" through the media query. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    (): ResolvedTheme => {
      const preference = readPreference();
      if (preference !== "system") return preference;
      return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
    },
    (): ResolvedTheme => "dark",
  );
}
