"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";

export interface DialogProps {
  open: boolean;
  /** Called with false when the user dismisses the dialog (Escape, backdrop, close button). */
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Actions, usually Buttons, shown at the bottom right. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * A modal dialog on the native `<dialog>` element: the browser makes the rest
 * of the page inert, keeps focus inside, and closes it on Escape. Focus moves
 * back to the element that was focused before it opened.
 *
 * @example
 * <Dialog
 *   open={confirming}
 *   onOpenChange={setConfirming}
 *   title="Reset the editor?"
 *   description="Your draft will be replaced by the starter code."
 *   footer={<Button variant="destructive" onClick={reset}>Reset</Button>}
 * />
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={() => {
        returnFocus.current?.focus();
        returnFocus.current = null;
        if (open) onOpenChange(false);
      }}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-card p-0 text-card-foreground shadow-lg",
        "backdrop:bg-black/50",
        className,
      )}
    >
      <div className="grid gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <h2 id={titleId} className="text-lg leading-tight font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        {children}
        {footer ? <div className="flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </dialog>
  );
}
