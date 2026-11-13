/**
 * Content vocabulary as plain constants, with no schema library, so browser
 * code can import it cheaply as `@repo/shared/vocabulary`. The zod schemas
 * built from it are in content.ts.
 */

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** `micro`: one function. `model`: assembles earlier pieces. */
export const PROBLEM_TYPES = ["micro", "model"] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

/** Sandbox image a problem runs in. */
export const RUN_ENVIRONMENTS = ["numpy", "torch"] as const;
export type RunEnvironment = (typeof RUN_ENVIRONMENTS)[number];

export const PAPER_STATUSES = ["draft", "published", "archived"] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const PROBLEM_STATUSES = ["published", "retired"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/** Where a paper came from. Sync only ever touches `repo` papers. */
export const CONTENT_SOURCES = ["repo", "pipeline", "manual"] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

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
export type ContentTag = (typeof CONTENT_TAGS)[number];
