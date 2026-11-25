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

/**
 * `content/papers/<id>/draft/public.json`: a paper not yet published, as the
 * pipeline assembled it or a maintainer last edited it. Not cached.
 */
export const paperDraftPublicDocSchema = z.object({
  schemaVersion: z.literal(1),
  paperId: slugSchema,
  /** The ingestion that produced it; null for a draft made by hand. */
  ingestionId: z.uuid().nullable(),
  updatedAt: isoTimestamp,
  paper: paperMetadataSchema,
  problems: z.array(storedProblemPublicSchema),
});
export type PaperDraftPublicDoc = z.infer<typeof paperDraftPublicDocSchema>;

/** `content/papers/<id>/draft/private.json` */
export const paperDraftPrivateDocSchema = z.object({
  schemaVersion: z.literal(1),
  paperId: slugSchema,
  problems: z.array(storedProblemPrivateSchema),
});
export type PaperDraftPrivateDoc = z.infer<typeof paperDraftPrivateDocSchema>;

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

/** Who owns a track: the repository's files (`content:sync`) or the CMS (docs/specs/14-cms.md §7). */
export const trackOriginSchema = z.enum(["library", "cms"]);

export const storedTrackSchema = z.object({
  id: slugSchema,
  title: z.string(),
  summary: z.string(),
  paperIds: z.array(slugSchema),
  origin: trackOriginSchema.default("library"),
});
export type StoredTrack = z.infer<typeof storedTrackSchema>;

/** `content/tracks.json` */
export const tracksDocSchema = z.object({
  schemaVersion: z.literal(1),
  /** Hash of the library's tracks at the last sync. */
  sourceHash: z.string(),
  /** Bumped on every write; a stale editor's save is refused (docs/specs/14-cms.md §7.3). */
  revision: z.number().int().min(0).default(0),
  tracks: z.array(storedTrackSchema),
});
export type TracksDoc = z.infer<typeof tracksDocSchema>;

// ── Quiz sets (docs/specs/10-secondary-features.md §1) ─────────────────────────

/** One topic in `content/exams/index.json`. */
export const examIndexTopicSchema = z.object({
  id: slugSchema,
  title: z.string(),
  questionCount: z.number().int().min(0),
  /** Hash of the topic's source file; sync skips an unchanged topic. */
  sourceHash: z.string(),
});
export type ExamIndexTopic = z.infer<typeof examIndexTopicSchema>;

/**
 * `content/exams/index.json`: every quiz topic. Written after the topic's
 * documents, so a topic listed here is complete.
 */
export const examIndexSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: isoTimestamp,
  topics: z.array(examIndexTopicSchema),
});
export type ExamIndex = z.infer<typeof examIndexSchema>;

/** `content/exams/<topic>/public.json`: questions without answers. */
export const examPublicDocSchema = z.object({
  schemaVersion: z.literal(1),
  topicId: slugSchema,
  sourceHash: z.string(),
  title: z.string(),
  questions: z.array(
    z.object({
      id: slugSchema,
      difficulty: difficultySchema,
      prompt: z.string(),
      options: z.array(z.string()),
    }),
  ),
});
export type ExamPublicDoc = z.infer<typeof examPublicDocSchema>;

/** `content/exams/<topic>/private.json`: answers and explanations, never served before grading. */
export const examPrivateDocSchema = z.object({
  schemaVersion: z.literal(1),
  topicId: slugSchema,
  sourceHash: z.string(),
  questions: z.array(
    z.object({
      id: slugSchema,
      answer: z.number().int().min(0),
      explanation: z.string(),
    }),
  ),
});
export type ExamPrivateDoc = z.infer<typeof examPrivateDocSchema>;

// ── Courses (docs/specs/10-secondary-features.md §5) ───────────────────────────

/** One course in `content/courses/index.json`. */
export const courseIndexEntrySchema = z.object({
  id: slugSchema,
  title: z.string(),
  summary: z.string(),
  lectureCount: z.number().int().min(0),
  exerciseCount: z.number().int().min(0),
  /** Seconds of video across the course's lectures. */
  durationSeconds: z.number().int().min(0),
  sourceHash: z.string(),
});
export type CourseIndexEntry = z.infer<typeof courseIndexEntrySchema>;

/** `content/courses/index.json`, written after the courses' documents. */
export const courseIndexSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: isoTimestamp,
  courses: z.array(courseIndexEntrySchema),
});
export type CourseIndex = z.infer<typeof courseIndexSchema>;

const storedQuestionSchema = z.object({
  id: slugSchema,
  difficulty: difficultySchema,
  prompt: z.string(),
  options: z.array(z.string()),
});

/** `content/courses/<id>/public.json`: the syllabus and exercise questions, no answers, no video keys. */
export const coursePublicDocSchema = z.object({
  schemaVersion: z.literal(1),
  courseId: slugSchema,
  sourceHash: z.string(),
  title: z.string(),
  summary: z.string(),
  items: z.array(
    z.discriminatedUnion("type", [
      z.object({
        id: slugSchema,
        type: z.literal("lecture"),
        title: z.string(),
        durationSeconds: z.number().int().min(1),
      }),
      z.object({
        id: slugSchema,
        type: z.literal("exercise"),
        title: z.string(),
        questions: z.array(storedQuestionSchema),
      }),
    ]),
  ),
});
export type CoursePublicDoc = z.infer<typeof coursePublicDocSchema>;

/** `content/courses/<id>/private.json`: each lecture's video key and each exercise's answers. */
export const coursePrivateDocSchema = z.object({
  schemaVersion: z.literal(1),
  courseId: slugSchema,
  sourceHash: z.string(),
  items: z.array(
    z.discriminatedUnion("type", [
      z.object({ id: slugSchema, type: z.literal("lecture"), videoKey: z.string() }),
      z.object({
        id: slugSchema,
        type: z.literal("exercise"),
        answers: z.array(
          z.object({ id: slugSchema, answer: z.number().int().min(0), explanation: z.string() }),
        ),
      }),
    ]),
  ),
});
export type CoursePrivateDoc = z.infer<typeof coursePrivateDocSchema>;
