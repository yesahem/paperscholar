"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type"> {
  /** The visible label, clickable with the box. */
  label: ReactNode;
  /** Help text under the label. */
  description?: ReactNode;
}

/**
 * A native checkbox with its label beside it. Standalone (not inside a Field),
 * because the label is part of the control.
 */
export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const descriptionId = description && id ? `${id}-description` : undefined;
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm", className)}>
      <input
        {...props}
        id={id}
        type="checkbox"
        aria-describedby={descriptionId}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
