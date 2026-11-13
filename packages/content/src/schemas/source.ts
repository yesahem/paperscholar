import {
  ENVIRONMENT_PACKAGES,
  contentTagSchema,
  difficultySchema,
  problemStatusSchema,
  problemTypeSchema,
  runEnvironmentSchema,
  slugSchema,
} from "@repo/shared";
import { z } from "zod";

/**
 * Schemas of the authored files in content/ (docs/specs/03-content.md §6).
 * YAML keys are snake_case; parsed values are camelCase.
 */

const pythonIdentifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a Python identifier");
const moduleName = z
  .string()
  .regex(/^[a-z_][a-z0-9_]*$/, "must be a top-level module name");
/** A module or a submodule path, e.g. `torch` or `torch.optim`. */
const modulePath = z
  .string()
  .regex(
    /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/,
    "must be a module name such as torch or torch.optim",
  );

const uniqueList = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .refine((list) => new Set(list).size === list.length, "must not repeat entries");

export const paperFileSchema = z.strictObject({
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).min(1),
  year: z.number().int().min(1900).max(2100),
  url: z.url({ protocol: /^https$/, error: "must be an https URL" }),
  summary: z.string().trim().min(1).max(300),
  tags: uniqueList(contentTagSchema).min(1),
});
export type PaperFile = z.infer<typeof paperFileSchema>;

export const problemFileSchema = z
  .strictObject({
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1).max(300),
    difficulty: difficultySchema,
    type: problemTypeSchema,
    entry_point: pythonIdentifier,
    environment: runEnvironmentSchema,
    allowed_packages: uniqueList(moduleName),
    prohibited_imports: uniqueList(modulePath),
    time_limit_seconds: z.number().int().min(1).max(30),
    memory_limit_mb: z.number().int().min(64).max(2048),
    paper_refs: uniqueList(z.string().trim().min(1)).default([]),
    status: problemStatusSchema.default("published"),
  })
  .superRefine((problem, context) => {
    const available: readonly string[] = ENVIRONMENT_PACKAGES[problem.environment];
    for (const name of problem.allowed_packages) {
      if (!available.includes(name)) {
        context.addIssue({
          code: "custom",
          path: ["allowed_packages"],
          message: `${name} is not installed in the ${problem.environment} environment`,
        });
      }
    }
    for (const name of problem.allowed_packages) {
      if (problem.prohibited_imports.includes(name)) {
        context.addIssue({
          code: "custom",
          path: ["prohibited_imports"],
          message: `${name} cannot be both allowed and prohibited`,
        });
      }
    }
  })
  .transform((problem) => ({
    title: problem.title,
    summary: problem.summary,
    difficulty: problem.difficulty,
    type: problem.type,
    entryPoint: problem.entry_point,
    environment: problem.environment,
    allowedPackages: problem.allowed_packages,
    prohibitedImports: problem.prohibited_imports,
    timeLimitSeconds: problem.time_limit_seconds,
    memoryLimitMb: problem.memory_limit_mb,
    paperRefs: problem.paper_refs,
    status: problem.status,
  }));
export type ProblemFile = z.output<typeof problemFileSchema>;

export const trackFileSchema = z.strictObject({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(300),
  papers: uniqueList(slugSchema).min(1),
});
export type TrackFile = z.infer<typeof trackFileSchema>;
