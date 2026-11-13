import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

const alertVariants = cva(
  "grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4",
  {
    variants: {
      variant: {
        info: "[&>svg]:text-primary",
        success: "border-success [&>svg]:text-success",
        warning: "border-warning [&>svg]:text-warning",
        destructive: "border-destructive text-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleAlert,
} as const;

export interface AlertProps
  extends Omit<ComponentProps<"div">, "title">, VariantProps<typeof alertVariants> {
  title?: ReactNode;
}

/**
 * An inline message. Destructive alerts are announced immediately; the others
 * are announced politely.
 */
export function Alert({ className, variant, title, children, ...props }: AlertProps) {
  const Icon = ICONS[variant ?? "info"];
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      <div className="grid gap-1">
        {title ? <p className="leading-tight font-medium">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
