"use client";

import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn";

export interface RadioOption {
  value: string;
  /** The visible label, clickable with the button. */
  label: ReactNode;
  description?: ReactNode;
}

export interface RadioGroupProps {
  /** Names the group for everyone, including screen readers (a `<legend>`). */
  legend: ReactNode;
  /** Hides the legend visually; it is still announced. */
  hideLegend?: boolean;
  options: readonly RadioOption[];
  /** The selected option's value, or null for none. */
  value: string | null;
  onValueChange: (value: string) => void;
  /** Form name shared by the buttons; generated when omitted. */
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/**
 * One choice among a few, as native radio buttons in a `<fieldset>`: the
 * browser provides arrow-key movement within the group and a single tab stop.
 *
 * @example
 * <RadioGroup
 *   legend="Which component injects token order?"
 *   options={[{ value: "0", label: "Self-attention" }, { value: "1", label: "Positional encoding" }]}
 *   value={choice}
 *   onValueChange={setChoice}
 * />
 */
export function RadioGroup({
  legend,
  hideLegend = false,
  options,
  value,
  onValueChange,
  name,
  disabled = false,
  required = false,
  className,
}: RadioGroupProps) {
  const generated = useId();
  const groupName = name ?? `radio-${generated}`;
  return (
    <fieldset className={cn("grid gap-2", className)} disabled={disabled}>
      <legend className={cn("mb-1 text-sm font-medium", hideLegend && "sr-only")}>
        {legend}
      </legend>
      {options.map((option, index) => {
        const id = `${groupName}-${index}`;
        const descriptionId = option.description ? `${id}-description` : undefined;
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border border-input px-3 py-2 text-sm transition-colors hover:bg-accent",
              checked && "border-primary bg-accent",
              disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
            )}
          >
            <input
              id={id}
              type="radio"
              name={groupName}
              value={option.value}
              checked={checked}
              required={required}
              aria-describedby={descriptionId}
              onChange={() => onValueChange(option.value)}
              className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span className="grid gap-0.5">
              <span>{option.label}</span>
              {option.description ? (
                <span id={descriptionId} className="text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
