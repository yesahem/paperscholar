import { z } from "zod";
import { errorCodeSchema } from "./error-codes";

/** One failed check in a `validation_error`. */
export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

/**
 * Body of every non-2xx API response.
 * Contract: docs/specs/05-api.md §3.
 */
export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;
