import type {
  CourseProgress,
  Exercise,
  ExerciseResult,
  ItemProgress,
  Note,
  Playback,
  PutProgress,
} from "@repo/shared";
import { PLAYBACK_URL_SECONDS } from "@repo/shared/courses";
import { DIFFICULTIES } from "@repo/shared/vocabulary";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { apiRequest, type CallOptions } from "@repo/web-core/api/client";

/**
 * A learner's side of a course (docs/specs/10-secondary-features.md §5). Each
 * schema mirrors the one in @repo/shared; the type annotation keeps them in step.
 */

const itemPath = (courseId: string, itemId: string) =>
  `/v1/courses/${encodeURIComponent(courseId)}/items/${encodeURIComponent(itemId)}`;

export const playbackSchema: z.ZodMiniType<Playback> = z.object({
  url: z.string(),
  expiresInSeconds: z.literal(PLAYBACK_URL_SECONDS),
});

const question = {
  id: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  prompt: z.string(),
  options: z.array(z.string()),
};

export const exerciseSchema: z.ZodMiniType<Exercise> = z.object({
  itemId: z.string(),
  title: z.string(),
  questions: z.array(z.object(question)),
});

export const exerciseResultSchema: z.ZodMiniType<ExerciseResult> = z.object({
  itemId: z.string(),
  score: z.number(),
  total: z.number(),
  questions: z.array(
    z.object({
      ...question,
      chosen: z.nullable(z.number()),
      answer: z.number(),
      correct: z.boolean(),
      explanation: z.string(),
    }),
  ),
});

export const itemProgressSchema: z.ZodMiniType<ItemProgress> = z.object({
  itemId: z.string(),
  completed: z.boolean(),
  lastWatchedSeconds: z.number(),
  score: z.nullable(z.number()),
  completedAt: z.nullable(z.string()),
  updatedAt: z.string(),
});

export const courseProgressSchema: z.ZodMiniType<CourseProgress> = z.object({
  courseId: z.string(),
  items: z.array(itemProgressSchema),
});

export const noteSchema: z.ZodMiniType<Note> = z.object({
  body: z.string(),
  updatedAt: z.nullable(z.string()),
});

export function getPlayback(
  courseId: string,
  itemId: string,
  options: CallOptions = {},
): Promise<Playback> {
  return apiRequest(`${itemPath(courseId, itemId)}/playback`, playbackSchema, options);
}

export function getExercise(
  courseId: string,
  itemId: string,
  options: CallOptions = {},
): Promise<Exercise> {
  return apiRequest(`${itemPath(courseId, itemId)}/exercise`, exerciseSchema, options);
}

export function submitExercise(
  courseId: string,
  itemId: string,
  answers: (number | null)[],
  options: CallOptions = {},
): Promise<ExerciseResult> {
  return apiRequest(`${itemPath(courseId, itemId)}/exercise`, exerciseResultSchema, {
    ...options,
    method: "POST",
    body: { answers },
  });
}

export function getCourseProgress(
  courseId: string,
  options: CallOptions = {},
): Promise<CourseProgress> {
  return apiRequest(
    `/v1/courses/${encodeURIComponent(courseId)}/progress`,
    courseProgressSchema,
    options,
  );
}

export function putProgress(
  courseId: string,
  itemId: string,
  body: PutProgress,
  options: CallOptions = {},
): Promise<ItemProgress> {
  return apiRequest(`${itemPath(courseId, itemId)}/progress`, itemProgressSchema, {
    ...options,
    method: "PUT",
    body,
  });
}

export function getNote(
  courseId: string,
  itemId: string,
  options: CallOptions = {},
): Promise<Note> {
  return apiRequest(`${itemPath(courseId, itemId)}/notes`, noteSchema, options);
}

export function putNote(
  courseId: string,
  itemId: string,
  body: string,
  options: CallOptions = {},
): Promise<Note> {
  return apiRequest(`${itemPath(courseId, itemId)}/notes`, noteSchema, {
    ...options,
    method: "PUT",
    body: { body },
  });
}
