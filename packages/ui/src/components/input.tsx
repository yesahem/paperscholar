"use client";

import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { useFieldControl } from "./field";

/** Shared look of single-line and multi-line text controls. */
export const textControlClasses = cn(
  "w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground",
  "placeholder:text-muted-foreground transition-colors",
  "focus-visible:border-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive",
);

export interface InputProps extends ComponentProps<"input"> {
  /** Marks the control invalid. Inside a Field, the Field's error does this. */
  invalid?: boolean;
}

export function Input({
  className,
  id,
  invalid,
  required,
  disabled,
  "aria-describedby": ariaDescribedBy,
  ...props
}: InputProps) {
  const control = useFieldControl({
    id,
    invalid,
    required,
    disabled,
    "aria-describedby": ariaDescribedBy,
  });
  return (
    <input
      {...props}
      id={control.id}
      required={control.required}
      disabled={control.disabled}
      aria-invalid={control.invalid || undefined}
      aria-describedby={control["aria-describedby"]}
      className={cn(
        textControlClasses,
        "h-10 py-2 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
    />
  );
}
