"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Label } from "./label";

interface FieldContextValue {
  controlId: string;
  descriptionId: string | undefined;
  errorId: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  /** Visible label for the control. */
  label: ReactNode;
  /** Help text shown under the control. */
  description?: ReactNode;
  /** Error message. When present the control is marked invalid. */
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Id for the control; generated when omitted. */
  id?: string;
  className?: string;
  /** Exactly one form control: Input, Textarea, FileUpload, or a custom one using useFieldControl. */
  children: ReactNode;
}

/**
 * Wraps a form control with its label, help text and error, and wires up the
 * accessibility attributes (id, aria-describedby, aria-invalid, required).
 *
 * @example
 * <Field label="Email" error={errors.email} required>
 *   <Input type="email" name="email" autoComplete="email" />
 * </Field>
 */
export function Field({
  label,
  description,
  error,
  required = false,
  disabled = false,
  id,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const hasError =
    error !== undefined && error !== null && error !== false && error !== "";
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = hasError ? `${controlId}-error` : undefined;

  return (
    <FieldContext
      value={{
        controlId,
        descriptionId,
        errorId,
        invalid: hasError,
        required,
        disabled,
      }}
    >
      <div
        className={cn("grid gap-2", className)}
        data-invalid={hasError || undefined}
        data-disabled={disabled || undefined}
      >
        <Label htmlFor={controlId} required={required}>
          {label}
        </Label>
        {children}
        {description ? (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {hasError ? (
          <p id={errorId} className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext>
  );
}

export interface FieldControlOptions {
  id?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
}

export interface FieldControlProps {
  id: string | undefined;
  invalid: boolean;
  required: boolean | undefined;
  disabled: boolean | undefined;
  "aria-describedby": string | undefined;
}

/**
 * Merges a control's own props with those of an enclosing Field. Props passed
 * directly to the control win. Works outside a Field too.
 */
export function useFieldControl(own: FieldControlOptions = {}): FieldControlProps {
  const field = useContext(FieldContext);
  const describedBy = [own["aria-describedby"], field?.descriptionId, field?.errorId]
    .filter(Boolean)
    .join(" ");
  return {
    id: own.id ?? field?.controlId,
    invalid: own.invalid ?? field?.invalid ?? false,
    required: own.required ?? (field?.required || undefined),
    disabled: own.disabled ?? (field?.disabled || undefined),
    "aria-describedby": describedBy || undefined,
  };
}
