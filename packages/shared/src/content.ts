import { z } from "zod";
import {
  CONTENT_SOURCES,
  CONTENT_TAGS,
  DIFFICULTIES,
  PAPER_STATUSES,
  PROBLEM_STATUSES,
  PROBLEM_TYPES,
  RUN_ENVIRONMENTS,
  type RunEnvironment,
} from "./vocabulary";

/**
 * Content vocabulary shared by every package that reads or writes papers.
 * Spec: docs/specs/02-monorepo.md §7, docs/specs/03-content.md.
 */

export {
  CONTENT_SOURCES,
  CONTENT_TAGS,
  DIFFICULTIES,
  PAPER_STATUSES,
  PROBLEM_STATUSES,
  PROBLEM_TYPES,
  RUN_ENVIRONMENTS,
};
export type {
  ContentSource,
  ContentTag,
  Difficulty,
  PaperStatus,
  ProblemStatus,
  ProblemType,
  RunEnvironment,
} from "./vocabulary";

/** Paper, problem and track ids: lowercase words joined by single hyphens, ≤ 64 chars. */
export const slugSchema = z
  .string()
  .max(64, "must be at most 64 characters")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase words joined by single hyphens");

export const difficultySchema = z.enum(DIFFICULTIES);
export const problemTypeSchema = z.enum(PROBLEM_TYPES);
export const runEnvironmentSchema = z.enum(RUN_ENVIRONMENTS);

/**
 * Third-party packages importable in each environment. Must match the pinned
 * requirement files in packages/runner/environments (a runner test checks this).
 */
export const ENVIRONMENT_PACKAGES = {
  numpy: ["numpy"],
  torch: ["numpy", "torch"],
} as const satisfies Record<RunEnvironment, readonly string[]>;

export const paperStatusSchema = z.enum(PAPER_STATUSES);
export const problemStatusSchema = z.enum(PROBLEM_STATUSES);
export const contentSourceSchema = z.enum(CONTENT_SOURCES);
export const contentTagSchema = z.enum(CONTENT_TAGS);
