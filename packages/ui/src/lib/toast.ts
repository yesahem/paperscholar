/** How long a toast stays, in milliseconds, unless closed first. */
export const TOAST_DURATION_MS = 6000;
/** Toasts shown at once; older ones give way. */
export const MAX_TOASTS = 3;

export type ToastVariant = "info" | "success" | "warning" | "destructive";

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export type ToastAction =
  { type: "add"; toast: ToastMessage } | { type: "dismiss"; id: number };

/** The visible toasts after `action`: newest last, at most MAX_TOASTS, no repeated title. */
export function toastReducer(
  toasts: ToastMessage[],
  action: ToastAction,
): ToastMessage[] {
  switch (action.type) {
    case "add": {
      const others = toasts.filter((toast) => toast.title !== action.toast.title);
      return [...others, action.toast].slice(-MAX_TOASTS);
    }
    case "dismiss":
      return toasts.filter((toast) => toast.id !== action.id);
  }
}
