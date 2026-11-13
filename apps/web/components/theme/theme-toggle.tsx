"use client";

import { Button } from "@repo/ui/components/button";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/lib/theme";
import { setThemePreference, useThemePreference } from "./theme-store";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Use the system theme", Icon: Monitor },
  { value: "light", label: "Use the light theme", Icon: Sun },
  { value: "dark", label: "Use the dark theme", Icon: Moon },
];

/** Three-way switch: follow the system, or force light or dark. */
export function ThemeToggle() {
  const preference = useThemePreference();
  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex items-center rounded-md border border-border p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          title={label}
          aria-pressed={preference === value}
          className="size-7 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          onClick={() => setThemePreference(value)}
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
