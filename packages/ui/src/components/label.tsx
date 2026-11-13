import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export interface LabelProps extends ComponentProps<"label"> {
  /** Appends a required marker, announced as "required". */
  required?: boolean;
}

export function Label({ className, required = false, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "text-sm leading-none font-medium text-foreground peer-disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      ) : null}
    </label>
  );
}
