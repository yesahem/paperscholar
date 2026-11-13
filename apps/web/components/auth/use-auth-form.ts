"use client";

import { useState } from "react";
import { AuthRequestError } from "@/lib/auth/auth-api";
import type { AuthField } from "@/lib/auth/messages";

export type FieldErrors = Partial<Record<AuthField, string>>;

/**
 * State shared by the auth forms: whether a request is running, the message
 * about the whole form, and messages about single fields.
 */
export function useAuthForm() {
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  /** Runs `action`, turning an AuthRequestError into form or field messages. */
  async function run(action: () => Promise<void>): Promise<boolean> {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await action();
      return true;
    } catch (error) {
      if (error instanceof AuthRequestError) {
        const { field, message } = error.problem;
        if (field) setFieldErrors({ [field]: message });
        else setFormError(message);
      } else {
        setFormError("Something went wrong on our side. Try again.");
      }
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, formError, fieldErrors, setFieldErrors, run };
}
