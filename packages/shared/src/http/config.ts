import { z } from "zod";

/**
 * Optional parts of the product. The API decides which are on for this
 * instance (docs/specs/13-self-hosting.md §4) and the web app hides the rest.
 */
export const FEATURES = [
  "pipeline",
  "coldMail",
  "interview",
  "courses",
  "listings",
  "googleSignIn",
  "emailVerification",
  "passwordReset",
  "signups",
] as const;
export const featureSchema = z.enum(FEATURES);
export type Feature = z.infer<typeof featureSchema>;

/** Largest submission accepted, in bytes of UTF-8 (docs/specs/05-api.md §6). */
export const MAX_CODE_BYTES = 64 * 1024;

/** `GET /v1/config`. Contract: docs/specs/05-api.md §8. */
export const instanceConfigSchema = z.object({
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
  } satisfies Record<Feature, z.ZodBoolean>),
  limits: z.object({
    runsPerDay: z.number().int().positive(),
    codeBytes: z.number().int().positive(),
  }),
  version: z.string(),
});
export type InstanceConfig = z.infer<typeof instanceConfigSchema>;
export type FeatureFlags = InstanceConfig["features"];
