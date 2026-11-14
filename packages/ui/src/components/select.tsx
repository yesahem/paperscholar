"use client";

import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { useFieldControl } from "./field";
import { textControlClasses } from "./input";

export interface SelectProps extends ComponentProps<"select"> {
  /** Marks the control invalid. Inside a Field, the Field's error does this. */
  invalid?: boolean;
}

/**
 * A native select, styled like Input: the browser's own picker keeps it
 * accessible on every device. Pass `<option>` children.
 */
export function Select({
  className,
  id,
  invalid,
  required,
  disabled,
  "aria-describedby": ariaDescribedBy,
  ...props
}: SelectProps) {
  const control = useFieldControl({
    id,
    invalid,
    required,
    disabled,
    "aria-describedby": ariaDescribedBy,
  });
  return (
    <span className="relative block">
      <select
        {...props}
        id={control.id}
        required={control.required}
        disabled={control.disabled}
        aria-invalid={control.invalid || undefined}
        aria-describedby={control["aria-describedby"]}
        className={cn(textControlClasses, "appearance-none pr-9", className)}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
