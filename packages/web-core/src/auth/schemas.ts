import { ROLES } from "@repo/shared/accounts";
import type { InstanceConfig, Me } from "@repo/shared";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";

/** Mirrors `meSchema` in @repo/shared; the annotation keeps them in step. */
export const meSchema: z.ZodMiniType<Me> = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  avatarUrl: z.nullable(z.string()),
  bio: z.nullable(z.string()),
  role: z.enum(ROLES),
  createdAt: z.string(),
});

/** Mirrors `instanceConfigSchema` in @repo/shared; the annotation keeps them in step. */
export const instanceConfigSchema: z.ZodMiniType<InstanceConfig> = z.object({
  features: z.object({
    pipeline: z.boolean(),
    coldMail: z.boolean(),
    interview: z.boolean(),
    courses: z.boolean(),
    listings: z.boolean(),
    googleSignIn: z.boolean(),
    emailVerification: z.boolean(),
    passwordReset: z.boolean(),
    signups: z.boolean(),
  }),
  limits: z.object({
    runsPerDay: z.number(),
    codeBytes: z.number(),
  }),
  version: z.string(),
});
