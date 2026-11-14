import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export interface MeterProps extends Omit<ComponentProps<"div">, "children"> {
  value: number;
  max: number;
  /** What the meter measures, e.g. "Tests passed". */
  label: string;
  /** Colour of the filled part. The number must also be shown in text nearby. */
  tone?: "primary" | "success" | "destructive";
}

const TONES = {
  primary: "bg-primary",
  success: "bg-success",
  destructive: "bg-destructive",
} as const;

/** A horizontal bar for a known quantity, such as tests passed out of the total. */
export function Meter({
  value,
  max,
  label,
  tone = "primary",
  className,
  ...props
}: MeterProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={`${value} of ${max}`}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full", TONES[tone])}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
