"use client";

import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { useFieldControl } from "./field";
import { textControlClasses } from "./input";

export interface TextareaProps extends ComponentProps<"textarea"> {
  /** Marks the control invalid. Inside a Field, the Field's error does this. */
  invalid?: boolean;
}

export function Textarea({
  className,
  id,
  invalid,
  required,
  disabled,
  rows = 4,
  "aria-describedby": ariaDescribedBy,
  ...props
}: TextareaProps) {
  const control = useFieldControl({
    id,
    invalid,
    required,
    disabled,
    "aria-describedby": ariaDescribedBy,
  });
  return (
    <textarea
      {...props}
      rows={rows}
      id={control.id}
      required={control.required}
      disabled={control.disabled}
      aria-invalid={control.invalid || undefined}
      aria-describedby={control["aria-describedby"]}
      className={cn(textControlClasses, "min-h-20 resize-y py-2", className)}
    />
  );
}
