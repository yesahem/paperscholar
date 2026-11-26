import { z } from "zod";
import {
  COLD_MAIL_NAME_MAX_LENGTH,
  COLD_MAIL_NOTES_MAX_LENGTH,
  COLD_MAIL_ORGANISATION_MAX_LENGTH,
  COLD_MAIL_PAGE_SIZE,
  COLD_MAIL_ROLE_MAX_LENGTH,
  COLD_MAIL_STATUSES,
  COLD_MAIL_TARGET_TYPES,
  COLD_MAIL_TONES,
} from "../cold-mail";

/**
 * Contracts of the CV and cold-mail endpoints
 * (docs/specs/10-secondary-features.md §6).
 */

const isoTimestamp = z.iso.datetime({ offset: true });
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "must not be empty")
    .max(max, `must be at most ${max} characters`);

/** A stored CV, as its owner sees it. */
export const cvSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  sizeBytes: z.number().int().min(0),
  /** Null when the page count could not be read from the file. */
  pages: z.number().int().min(1).nullable(),
  uploadedAt: isoTimestamp,
});
export type Cv = z.infer<typeof cvSchema>;

export const cvListSchema = z.object({ items: z.array(cvSchema) });
export type CvList = z.infer<typeof cvListSchema>;

export const cvParamsSchema = z.strictObject({ id: z.uuid("must be a CV id") });

export const coldMailTargetSchema = z.strictObject({
  name: text(COLD_MAIL_NAME_MAX_LENGTH),
  organisation: text(COLD_MAIL_ORGANISATION_MAX_LENGTH),
  role: text(COLD_MAIL_ROLE_MAX_LENGTH).optional(),
  /** Free text from the user: material to write from, never instructions. */
  notes: text(COLD_MAIL_NOTES_MAX_LENGTH).optional(),
});
export type ColdMailTarget = z.infer<typeof coldMailTargetSchema>;

/** `POST /v1/cold-mails` → `202 { id }`. */
export const createColdMailSchema = z.strictObject({
  cvId: z.uuid("must be one of your CVs"),
  targetType: z.enum(COLD_MAIL_TARGET_TYPES),
  target: coldMailTargetSchema,
  tone: z.enum(COLD_MAIL_TONES),
});
export type CreateColdMail = z.infer<typeof createColdMailSchema>;

export const coldMailCreatedSchema = z.object({ id: z.uuid() });
export type ColdMailCreated = z.infer<typeof coldMailCreatedSchema>;

/**
 * What the model must return, enforced with structured outputs and checked
 * again with this schema before anything is stored.
 */
export const coldMailDraftSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  /** Short points from the CV the email relies on, for the user to check. */
  highlights: z.array(z.string().trim().min(1).max(300)).max(8),
});
export type ColdMailDraft = z.infer<typeof coldMailDraftSchema>;

/** `GET /v1/cold-mails/:id`. The draft is present only once `status` is `done`. */
export const coldMailSchema = z.object({
  id: z.uuid(),
  status: z.enum(COLD_MAIL_STATUSES),
  targetType: z.enum(COLD_MAIL_TARGET_TYPES),
  target: z.object({
    name: z.string(),
    organisation: z.string(),
    role: z.string().nullable(),
    notes: z.string().nullable(),
  }),
  tone: z.enum(COLD_MAIL_TONES),
  /** The CV used, or null once it has been deleted. */
  cv: z.object({ id: z.uuid(), filename: z.string() }).nullable(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  highlights: z.array(z.string()).nullable(),
  /** Why a failed generation failed, in words for the user. */
  failure: z.string().nullable(),
  createdAt: isoTimestamp,
  finishedAt: isoTimestamp.nullable(),
});
export type ColdMail = z.infer<typeof coldMailSchema>;

export const coldMailParamsSchema = z.strictObject({
  id: z.uuid("must be a cold-mail id"),
});

export const listColdMailsQuerySchema = z.strictObject({
  limit: z.coerce
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(1, "must be at least 1")
    .max(100, "must be at most 100")
    .default(COLD_MAIL_PAGE_SIZE),
  cursor: z.string().min(1).max(200).optional(),
});
export type ListColdMailsQuery = z.infer<typeof listColdMailsQuerySchema>;

export const coldMailListSchema = z.object({
  items: z.array(coldMailSchema),
  nextCursor: z.string().nullable(),
});
export type ColdMailList = z.infer<typeof coldMailListSchema>;
