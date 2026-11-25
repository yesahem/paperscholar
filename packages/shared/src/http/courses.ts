import { z } from "zod";
import { difficultySchema, slugSchema } from "../content";
import { COURSE_NOTE_MAX_LENGTH, PLAYBACK_URL_SECONDS } from "../courses";
import { EXAM_OPTION_COUNT } from "../exams";

/**
 * Contracts of the course endpoints (docs/specs/10-secondary-features.md §5).
 * Video keys and exercise answers never appear before an exercise is submitted.
 */

const isoTimestamp = z.iso.datetime({ offset: true });
const count = z.number().int().min(0);

/** A course in `GET /v1/courses`. */
export const courseSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  lectureCount: count,
  exerciseCount: count,
  /** Seconds of video in the course. */
  durationSeconds: count,
});
export type CourseSummary = z.infer<typeof courseSummarySchema>;

export const courseListSchema = z.object({ items: z.array(courseSummarySchema) });
export type CourseList = z.infer<typeof courseListSchema>;

export const courseItemSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("lecture"),
    title: z.string(),
    durationSeconds: count,
  }),
  z.object({
    id: z.string(),
    type: z.literal("exercise"),
    title: z.string(),
    questionCount: count,
  }),
]);
export type CourseItem = z.infer<typeof courseItemSchema>;

/** `GET /v1/courses/:courseId`: the syllabus. */
export const courseDetailSchema = courseSummarySchema.extend({
  items: z.array(courseItemSchema),
});
export type CourseDetail = z.infer<typeof courseDetailSchema>;

export const courseParamsSchema = z.strictObject({ courseId: slugSchema });
export const courseItemParamsSchema = z.strictObject({
  courseId: slugSchema,
  itemId: slugSchema,
});

/** `GET .../items/:itemId/playback`: a short-lived URL for the lecture's video. */
export const playbackSchema = z.object({
  url: z.string(),
  expiresInSeconds: z.literal(PLAYBACK_URL_SECONDS),
});
export type Playback = z.infer<typeof playbackSchema>;

const exerciseQuestionSchema = z.object({
  id: z.string(),
  difficulty: difficultySchema,
  /** Markdown. */
  prompt: z.string(),
  /** Inline markdown each. */
  options: z.array(z.string()),
});

/** `GET .../items/:itemId/exercise`: questions without answers. */
export const exerciseSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  questions: z.array(exerciseQuestionSchema),
});
export type Exercise = z.infer<typeof exerciseSchema>;

/** `POST .../items/:itemId/exercise`: one entry per question, in order; null is unanswered. */
export const submitExerciseSchema = z.strictObject({
  answers: z
    .array(
      z
        .number({ error: "must be an option index or null" })
        .int("must be a whole number")
        .min(0, "must be an option index")
        .max(EXAM_OPTION_COUNT.max - 1, "must be an option index")
        .nullable(),
    )
    .max(100),
});
export type SubmitExercise = z.infer<typeof submitExerciseSchema>;

export const exerciseResultSchema = z.object({
  itemId: z.string(),
  score: count,
  total: count,
  questions: z.array(
    exerciseQuestionSchema.extend({
      chosen: z.number().int().nullable(),
      answer: z.number().int(),
      correct: z.boolean(),
      /** Markdown. */
      explanation: z.string(),
    }),
  ),
});
export type ExerciseResult = z.infer<typeof exerciseResultSchema>;

/** `PUT .../items/:itemId/progress`. A completed item stays completed. */
export const putProgressSchema = z.strictObject({
  completed: z.boolean(),
  lastWatchedSeconds: z
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(0, "must not be negative")
    .max(6 * 60 * 60, "must be at most six hours"),
});
export type PutProgress = z.infer<typeof putProgressSchema>;

export const itemProgressSchema = z.object({
  itemId: z.string(),
  completed: z.boolean(),
  lastWatchedSeconds: count,
  /** Best exercise score, for exercises that were submitted. */
  score: count.nullable(),
  completedAt: isoTimestamp.nullable(),
  updatedAt: isoTimestamp,
});
export type ItemProgress = z.infer<typeof itemProgressSchema>;

/** `GET /v1/courses/:courseId/progress`: the caller's progress on every item they started. */
export const courseProgressSchema = z.object({
  courseId: z.string(),
  items: z.array(itemProgressSchema),
});
export type CourseProgress = z.infer<typeof courseProgressSchema>;

/** `PUT .../items/:itemId/notes`. An empty body clears the note. */
export const putNoteSchema = z.strictObject({
  body: z
    .string()
    .max(COURSE_NOTE_MAX_LENGTH, `must be at most ${COURSE_NOTE_MAX_LENGTH} characters`),
});
export type PutNote = z.infer<typeof putNoteSchema>;

/** `GET .../items/:itemId/notes`. `updatedAt` is null when there is no note. */
export const noteSchema = z.object({
  body: z.string(),
  updatedAt: isoTimestamp.nullable(),
});
export type Note = z.infer<typeof noteSchema>;
