import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export interface SpinnerProps extends Omit<ComponentProps<"svg">, "children"> {
  /**
   * Text announced to assistive technology. Omit when the spinner sits inside
   * an element that already announces its busy state, such as a loading Button.
   */
  label?: string;
}

/** An indeterminate loading indicator. */
export function Spinner({ label, className, ...props }: SpinnerProps) {
  const icon = (
    <LoaderCircle
      aria-hidden="true"
      className={cn("size-4 shrink-0 animate-spin", className)}
      {...props}
    />
  );
  if (!label) return icon;
  return (
    <span role="status" className="inline-flex items-center">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
