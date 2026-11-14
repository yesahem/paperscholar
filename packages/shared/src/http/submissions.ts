import { z } from "zod";
import { slugSchema } from "../content";
import {
  MAX_CODE_BYTES,
  SUBMISSION_MODES,
  SUBMISSION_PAGE_SIZE,
  SUBMISSION_STATUSES,
  TEST_GROUPS,
  TEST_STATUSES,
  utf8ByteLength,
  VERDICTS,
} from "../submissions";

/** Contract: docs/specs/05-api.md §6. */

export const submissionModeSchema = z.enum(SUBMISSION_MODES);
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export const verdictSchema = z.enum(VERDICTS);

/** Body of `POST /v1/submissions`. */
export const createSubmissionSchema = z.strictObject({
  paperId: slugSchema,
  problemId: slugSchema,
  code: z
    .string()
    .refine((code) => code.trim() !== "", "must not be empty")
    .refine(
      (code) => utf8ByteLength(code) <= MAX_CODE_BYTES,
      `must be at most ${MAX_CODE_BYTES} bytes`,
    ),
  mode: submissionModeSchema,
});
export type CreateSubmission = z.infer<typeof createSubmissionSchema>;

/** `202` from `POST /v1/submissions`. */
export const submissionCreatedSchema = z.object({
  id: z.string(),
  status: z.literal("queued"),
});
export type SubmissionCreated = z.infer<typeof submissionCreatedSchema>;

/** One test's result. Hidden tests never carry `traceback` or `stdout`. */
export const submissionTestSchema = z.object({
  name: z.string(),
  group: z.enum(TEST_GROUPS),
  status: z.enum(TEST_STATUSES),
  durationMs: z.number().nonnegative(),
  message: z.string().nullable(),
  traceback: z.string().nullable(),
  stdout: z.string().nullable(),
});
export type SubmissionTest = z.infer<typeof submissionTestSchema>;

const submissionFields = {
  id: z.string(),
  paperId: z.string(),
  problemId: z.string(),
  mode: submissionModeSchema,
  status: submissionStatusSchema,
  verdict: verdictSchema.nullable(),
  testsPassed: z.number().int().nonnegative().nullable(),
  testsTotal: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
};

/** `GET /v1/submissions/:id`. While queued or running, the result fields are null. */
export const submissionSchema = z.object({
  ...submissionFields,
  tests: z.array(submissionTestSchema).nullable(),
  /** Offending modules, for `import_violation`. */
  violations: z.array(z.string()).nullable(),
  /** The error text, for `runtime_error`. */
  errorOutput: z.string().nullable(),
  code: z.string(),
});
export type Submission = z.infer<typeof submissionSchema>;

/** An item of `GET /v1/submissions`: the submission without its code and results. */
export const submissionSummarySchema = z.object(submissionFields);
export type SubmissionSummary = z.infer<typeof submissionSummarySchema>;

export const submissionListSchema = z.object({
  items: z.array(submissionSummarySchema),
  nextCursor: z.string().nullable(),
});
export type SubmissionList = z.infer<typeof submissionListSchema>;

/** Query of `GET /v1/submissions`. A problem is named only together with its paper. */
export const listSubmissionsQuerySchema = z
  .strictObject({
    paperId: slugSchema.optional(),
    problemId: slugSchema.optional(),
    mode: submissionModeSchema.optional(),
    limit: z.coerce
      .number({ error: "must be a number" })
      .int("must be a whole number")
      .min(1, "must be at least 1")
      .max(SUBMISSION_PAGE_SIZE.max, `must be at most ${SUBMISSION_PAGE_SIZE.max}`)
      .default(SUBMISSION_PAGE_SIZE.default),
    cursor: z.string().min(1).max(200).optional(),
  })
  .refine((query) => query.problemId === undefined || query.paperId !== undefined, {
    path: ["problemId"],
    error: "needs paperId",
  });
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;

/** Path parameter of `GET /v1/submissions/:id`. */
export const submissionParamsSchema = z.strictObject({
  id: z.uuid("must be a submission id"),
});
