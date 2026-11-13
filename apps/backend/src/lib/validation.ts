import { zValidator } from "@hono/zod-validator";
import type { ValidationIssue } from "@repo/shared";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { AppError } from "./errors";

interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
}

/** Flattens schema issues into the `validation_error` details shape. */
export function toValidationIssues(issues: readonly IssueLike[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/**
 * Validates one part of the request (`json`, `query`, `param`, `form`, …) and
 * throws `validation_error` with every issue when it fails. Malformed JSON is a
 * `validation_error` too. Every route reads input through this, never through
 * `c.req.json()` directly (docs/specs/05-api.md §2).
 *
 * @example
 * routes.post("/", validate("json", createThingSchema), (c) => {
 *   const input = c.req.valid("json");
 * });
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError("validation_error", {
        details: { issues: toValidationIssues(result.error.issues) },
      });
    }
  });
}
