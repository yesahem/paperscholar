import {
  contentSourceSchema,
  contentTagSchema,
  difficultySchema,
  paperStatusSchema,
  problemStatusSchema,
  problemTypeSchema,
  runEnvironmentSchema,
  slugSchema,
} from "@repo/shared";
import { z } from "zod";

/**
 * Schemas of the JSON objects kept in storage (docs/specs/03-content.md §2.1).
 * Every read is validated, so a malformed or outdated object fails loudly.
 */

const versionNumber = z.number().int().min(1);
const isoTimestamp = z.iso.datetime({ offset: true });

export const paperMetadataSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  url: z.string(),
  summary: z.string(),
  tags: z.array(contentTagSchema),
});
export type PaperMetadata = z.infer<typeof paperMetadataSchema>;

/** Everything about a problem that learners may see. */
export const storedProblemPublicSchema = z.object({
  id: slugSchema,
  order: z.number().int().min(0),
  status: problemStatusSchema,
  title: z.string(),
  summary: z.string(),
  difficulty: difficultySchema,
  type: problemTypeSchema,
  entryPoint: z.string(),
  environment: runEnvironmentSchema,
  allowedPackages: z.array(z.string()),
  prohibitedImports: z.array(z.string()),
  timeLimitSeconds: z.number().int(),
  memoryLimitMb: z.number().int(),
  paperRefs: z.array(z.string()),
  description: z.string(),
  tutorial: z.string().nullable(),
  starter: z.string(),
  /** Signatures and docstrings of the helpers, without their bodies; null without helpers. */
  helpersInterface: z.string().nullable(),
  /** SHA-256 over every part of the problem, public and private. */
  contentHash: z.string(),
});
export type StoredProblemPublic = z.infer<typeof storedProblemPublicSchema>;

/** The parts learners never see. */
export const storedProblemPrivateSchema = z.object({
  id: slugSchema,
  solution: z.string(),
  testsPublic: z.string(),
  testsHidden: z.string(),
  helpers: z.string().nullable(),
});
export type StoredProblemPrivate = z.infer<typeof storedProblemPrivateSchema>;

/** `content/papers/<id>/v<N>/public.json` */
export const paperPublicDocSchema = z.object({
  schemaVersion: z.literal(1),
  paperId: slugSchema,
  version: versionNumber,
  paper: paperMetadataSchema,
  problems: z.array(storedProblemPublicSchema),
});
export type PaperPublicDoc = z.infer<typeof paperPublicDocSchema>;

/** `content/papers/<id>/v<N>/private.json` */
export const paperPrivateDocSchema = z.object({
  schemaVersion: z.literal(1),
  paperId: slugSchema,
  version: versionNumber,
  problems: z.array(storedProblemPrivateSchema),
});
export type PaperPrivateDoc = z.infer<typeof paperPrivateDocSchema>;

export const indexProblemSchema = storedProblemPublicSchema.pick({
  id: true,
  order: true,
  status: true,
  title: true,
  summary: true,
  difficulty: true,
  type: true,
});
export type IndexProblem = z.infer<typeof indexProblemSchema>;

/** One paper in `content/index.json`: enough for the catalogue, stats and leaderboard. */
export const indexEntrySchema = paperMetadataSchema.extend({
  id: slugSchema,
  status: paperStatusSchema,
  source: contentSourceSchema,
  /** The live version. */
  version: versionNumber,
  /** The highest version ever written. New versions are numbered after it. */
  latestVersion: versionNumber,
  /** Hash of the source files the live version was built from (repository papers). */
  sourceHash: z.string().nullable(),
  publishedAt: isoTimestamp.nullable(),
  publishedBy: z.string().nullable(),
  updatedAt: isoTimestamp,
  problems: z.array(indexProblemSchema),
});
export type IndexEntry = z.infer<typeof indexEntrySchema>;

/** `content/index.json`: the only mutable content object and the commit point. */
export const contentIndexSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: isoTimestamp,
  papers: z.array(indexEntrySchema),
});
export type ContentIndex = z.infer<typeof contentIndexSchema>;

export const storedTrackSchema = z.object({
  id: slugSchema,
  title: z.string(),
  summary: z.string(),
  paperIds: z.array(slugSchema),
});
export type StoredTrack = z.infer<typeof storedTrackSchema>;

/** `content/tracks.json` */
export const tracksDocSchema = z.object({
  schemaVersion: z.literal(1),
  sourceHash: z.string(),
  tracks: z.array(storedTrackSchema),
});
export type TracksDoc = z.infer<typeof tracksDocSchema>;
