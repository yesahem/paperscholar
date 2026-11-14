"use client";

import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";
import {
  TOAST_DURATION_MS,
  toastReducer,
  type ToastMessage,
  type ToastVariant,
} from "../lib/toast";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

const VARIANTS: Record<ToastVariant, string> = {
  info: "border-border",
  success: "border-success",
  warning: "border-warning",
  destructive: "border-destructive",
};

/**
 * Brief messages that do not block the page, announced by screen readers.
 * Wrap the app once; call `useToast()` anywhere below.
 *
 * @example
 * const toast = useToast();
 * toast({ title: "Too many runs", description: "Try again in 30 seconds.", variant: "warning" });
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    dispatch({
      type: "add",
      toast: { id: nextId.current, variant: "info", ...options },
    });
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ol
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dispatch({ type: "dismiss", id: toast.id })}
          />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <li
      role={toast.variant === "destructive" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg",
        VARIANTS[toast.variant],
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-muted-foreground">{toast.description}</p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-my-1 -mr-2 shrink-0"
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

/** Shows a toast. Must be used inside `ToastProvider`. */
export function useToast(): (options: ToastOptions) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return useMemo(() => show, [show]);
}
