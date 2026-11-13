import { z } from "zod";

/**
 * Content vocabulary shared by every package that reads or writes papers.
 * Spec: docs/specs/02-monorepo.md §7, docs/specs/03-content.md.
 */

/** Paper, problem and track ids: lowercase words joined by single hyphens, ≤ 64 chars. */
export const slugSchema = z
  .string()
  .max(64, "must be at most 64 characters")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase words joined by single hyphens");

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const difficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof difficultySchema>;

/** `micro`: one function. `model`: assembles earlier pieces. */
export const PROBLEM_TYPES = ["micro", "model"] as const;
export const problemTypeSchema = z.enum(PROBLEM_TYPES);
export type ProblemType = z.infer<typeof problemTypeSchema>;

/** Sandbox image a problem runs in. */
export const RUN_ENVIRONMENTS = ["numpy", "torch"] as const;
export const runEnvironmentSchema = z.enum(RUN_ENVIRONMENTS);
export type RunEnvironment = z.infer<typeof runEnvironmentSchema>;

/**
 * Third-party packages importable in each environment. Must match the pinned
 * requirement files in packages/runner/environments (a runner test checks this).
 */
export const ENVIRONMENT_PACKAGES = {
  numpy: ["numpy"],
  torch: ["numpy", "torch"],
} as const satisfies Record<RunEnvironment, readonly string[]>;

export const PAPER_STATUSES = ["draft", "published", "archived"] as const;
export const paperStatusSchema = z.enum(PAPER_STATUSES);
export type PaperStatus = z.infer<typeof paperStatusSchema>;

export const PROBLEM_STATUSES = ["published", "retired"] as const;
export const problemStatusSchema = z.enum(PROBLEM_STATUSES);
export type ProblemStatus = z.infer<typeof problemStatusSchema>;

/** Where a paper came from. Sync only ever touches `repo` papers. */
export const CONTENT_SOURCES = ["repo", "pipeline", "manual"] as const;
export const contentSourceSchema = z.enum(CONTENT_SOURCES);
export type ContentSource = z.infer<typeof contentSourceSchema>;

/** The controlled tag list. Add a tag here before using it in content. */
export const CONTENT_TAGS = [
  "attention",
  "classical-ml",
  "computer-vision",
  "convolutional-networks",
  "deep-learning",
  "embeddings",
  "fine-tuning",
  "fundamentals",
  "generative-models",
  "kernel-methods",
  "nlp",
  "optimization",
  "probabilistic-models",
  "recurrent-networks",
  "reinforcement-learning",
  "representation-learning",
  "transformers",
] as const;
export const contentTagSchema = z.enum(CONTENT_TAGS);
export type ContentTag = z.infer<typeof contentTagSchema>;
