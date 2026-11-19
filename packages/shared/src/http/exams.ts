import { z } from "zod";
import { difficultySchema, slugSchema } from "../content";
import {
  EXAM_ATTEMPTS_PAGE_SIZE,
  EXAM_MAX_TOPICS,
  EXAM_OPTION_COUNT,
  EXAM_QUESTION_COUNT,
} from "../exams";

/**
 * Contracts of the quiz endpoints (docs/specs/10-secondary-features.md §1).
 * Answers and explanations appear only in a `submitted` attempt.
 */

const isoTimestamp = z.iso.datetime({ offset: true });
const count = z.number().int().min(0);

/** `GET /v1/exams/topics`. */
export const examTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  questionCount: count,
});
export type ExamTopic = z.infer<typeof examTopicSchema>;

export const examTopicListSchema = z.object({ items: z.array(examTopicSchema) });
export type ExamTopicList = z.infer<typeof examTopicListSchema>;

/** `POST /v1/exams/attempts`. */
export const createExamAttemptSchema = z.strictObject({
  topics: z
    .array(slugSchema)
    .min(1, "choose at least one topic")
    .max(EXAM_MAX_TOPICS, `choose at most ${EXAM_MAX_TOPICS} topics`)
    .refine((topics) => new Set(topics).size === topics.length, "must not repeat topics"),
  count: z
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(EXAM_QUESTION_COUNT.min, `must be at least ${EXAM_QUESTION_COUNT.min}`)
    .max(EXAM_QUESTION_COUNT.max, `must be at most ${EXAM_QUESTION_COUNT.max}`),
});
export type CreateExamAttempt = z.infer<typeof createExamAttemptSchema>;

/**
 * `POST /v1/exams/attempts/:id/submit`. `answers[i]` is the index of the
 * option chosen for question `i`, or null when it was left unanswered.
 */
export const submitExamAttemptSchema = z.strictObject({
  answers: z
    .array(
      z
        .number({ error: "must be an option index or null" })
        .int("must be a whole number")
        .min(0, "must be an option index")
        .max(EXAM_OPTION_COUNT.max - 1, "must be an option index")
        .nullable(),
    )
    .max(EXAM_QUESTION_COUNT.max),
});
export type SubmitExamAttempt = z.infer<typeof submitExamAttemptSchema>;

export const examAttemptParamsSchema = z.strictObject({
  id: z.uuid("must be an attempt id"),
});

export const listExamAttemptsQuerySchema = z.strictObject({
  limit: z.coerce
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(1, "must be at least 1")
    .max(100, "must be at most 100")
    .default(EXAM_ATTEMPTS_PAGE_SIZE),
  cursor: z.string().min(1).max(200).optional(),
});
export type ListExamAttemptsQuery = z.infer<typeof listExamAttemptsQuerySchema>;

/** A question as served: no answer, no explanation. */
export const examQuestionSchema = z.object({
  topicId: z.string(),
  id: z.string(),
  difficulty: difficultySchema,
  /** Markdown. */
  prompt: z.string(),
  options: z.array(z.string()),
});
export type ExamQuestion = z.infer<typeof examQuestionSchema>;

/** A question after grading. */
export const gradedExamQuestionSchema = examQuestionSchema.extend({
  /** The option the learner chose, or null. */
  chosen: z.number().int().nullable(),
  /** The right option. */
  answer: z.number().int(),
  correct: z.boolean(),
  /** Markdown. */
  explanation: z.string(),
});
export type GradedExamQuestion = z.infer<typeof gradedExamQuestionSchema>;

const attemptTopicSchema = z.object({ id: z.string(), title: z.string() });

const attemptBase = {
  id: z.uuid(),
  topics: z.array(attemptTopicSchema),
  total: count,
  startedAt: isoTimestamp,
  expiresAt: isoTimestamp,
};

/** An attempt still running, or one that ran out of time unsubmitted. */
export const openExamAttemptSchema = z.object({
  ...attemptBase,
  status: z.enum(["in_progress", "expired"]),
  questions: z.array(examQuestionSchema),
});
export type OpenExamAttempt = z.infer<typeof openExamAttemptSchema>;

/** A graded attempt: the only shape that carries answers and explanations. */
export const submittedExamAttemptSchema = z.object({
  ...attemptBase,
  status: z.literal("submitted"),
  score: count,
  submittedAt: isoTimestamp,
  questions: z.array(gradedExamQuestionSchema),
});
export type SubmittedExamAttempt = z.infer<typeof submittedExamAttemptSchema>;

/** `GET /v1/exams/attempts/:id`. */
export const examAttemptSchema = z.discriminatedUnion("status", [
  openExamAttemptSchema,
  submittedExamAttemptSchema,
]);
export type ExamAttempt = z.infer<typeof examAttemptSchema>;

/** One row of `GET /v1/exams/attempts`. */
export const examAttemptSummarySchema = z.object({
  id: z.uuid(),
  topics: z.array(attemptTopicSchema),
  status: z.enum(["in_progress", "submitted", "expired"]),
  score: count.nullable(),
  total: count,
  startedAt: isoTimestamp,
  submittedAt: isoTimestamp.nullable(),
});
export type ExamAttemptSummary = z.infer<typeof examAttemptSummarySchema>;

export const examAttemptListSchema = z.object({
  items: z.array(examAttemptSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ExamAttemptList = z.infer<typeof examAttemptListSchema>;
