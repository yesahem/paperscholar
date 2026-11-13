import { z } from "zod";
import {
  contentTagSchema,
  difficultySchema,
  problemTypeSchema,
  runEnvironmentSchema,
  slugSchema,
} from "../content";

/**
 * Public content responses. Contract: docs/specs/05-api.md §5. The backend
 * builds these from explicit field lists; the web app parses them on receipt.
 */

export const difficultyCountsSchema = z.object({
  easy: z.number().int().min(0),
  medium: z.number().int().min(0),
  hard: z.number().int().min(0),
});
export type DifficultyCounts = z.infer<typeof difficultyCountsSchema>;

export const paperSummarySchema = z.object({
  id: slugSchema,
  title: z.string(),
  authors: z.array(z.string()),
  /** Null when the paper's year is unknown. */
  year: z.number().int().nullable(),
  summary: z.string(),
  url: z.string(),
  tags: z.array(contentTagSchema),
  problemCount: z.number().int().min(0),
  difficultyCounts: difficultyCountsSchema,
});
export type PaperSummary = z.infer<typeof paperSummarySchema>;

/** `GET /v1/papers` */
export const paperListSchema = z.object({ items: z.array(paperSummarySchema) });
export type PaperList = z.infer<typeof paperListSchema>;

export const problemSummarySchema = z.object({
  id: slugSchema,
  title: z.string(),
  summary: z.string(),
  difficulty: difficultySchema,
  type: problemTypeSchema,
  /** Position within the paper, 1-based and without gaps. */
  order: z.number().int().min(1),
});
export type ProblemSummary = z.infer<typeof problemSummarySchema>;

/** `GET /v1/papers/:paperId` */
export const paperDetailSchema = paperSummarySchema.extend({
  problems: z.array(problemSummarySchema),
});
export type PaperDetail = z.infer<typeof paperDetailSchema>;

/** `GET /v1/papers/:paperId/problems/:problemId` */
export const problemDetailSchema = problemSummarySchema.extend({
  paperId: slugSchema,
  /** Markdown. */
  description: z.string(),
  /** Markdown, or null when the problem has no tutorial. */
  tutorial: z.string().nullable(),
  /** Python the editor starts with. */
  starter: z.string(),
  entryPoint: z.string(),
  environment: runEnvironmentSchema,
  allowedPackages: z.array(z.string()),
  prohibitedImports: z.array(z.string()),
  timeLimitSeconds: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  paperRefs: z.array(z.string()),
  /** Signatures and docstrings of the problem's helpers, never their bodies. */
  helpersInterface: z.string().nullable(),
});
export type ProblemDetail = z.infer<typeof problemDetailSchema>;

export const trackSchema = z.object({
  id: slugSchema,
  title: z.string(),
  summary: z.string(),
  /** Published papers only, in the track's order. */
  paperIds: z.array(slugSchema),
});
export type Track = z.infer<typeof trackSchema>;

/** `GET /v1/tracks` */
export const trackListSchema = z.object({ items: z.array(trackSchema) });
export type TrackList = z.infer<typeof trackListSchema>;
