import { z } from "zod";
import { BIO_MAX_LENGTH, normaliseUsername, ROLES, usernameProblem } from "../accounts";

export const roleSchema = z.enum(ROLES);

/**
 * A username as typed: trimmed and lowercased, then checked against the
 * length, character and reserved-name rules (docs/specs/06-auth.md §3).
 */
export const usernameSchema = z
  .string()
  .transform(normaliseUsername)
  .superRefine((username, context) => {
    const problem = usernameProblem(username);
    if (problem) context.addIssue({ code: "custom", message: problem });
  });

/** `GET /v1/me`, and the result of `PATCH /v1/me`. Contract: docs/specs/05-api.md §7. */
export const meSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  role: roleSchema,
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

/** Body of `PATCH /v1/me`. An empty bio clears it. */
export const updateMeSchema = z
  .strictObject({
    username: usernameSchema.optional(),
    bio: z
      .string()
      .trim()
      .max(BIO_MAX_LENGTH, `must be at most ${BIO_MAX_LENGTH} characters`)
      .transform((bio) => (bio === "" ? null : bio))
      .nullable()
      .optional(),
  })
  .refine((body) => body.username !== undefined || body.bio !== undefined, {
    error: "change at least one of username and bio",
  });
export type UpdateMe = z.input<typeof updateMeSchema>;

/** Body of `DELETE /v1/me`: the account's username, typed as confirmation. */
export const deleteMeSchema = z.strictObject({
  confirm: z.string().min(1, "is required"),
});
export type DeleteMe = z.infer<typeof deleteMeSchema>;
