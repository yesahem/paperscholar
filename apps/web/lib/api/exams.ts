import type {
  CreateExamAttempt,
  ExamAttempt,
  ExamAttemptList,
  ExamTopicList,
  OpenExamAttempt,
  SubmittedExamAttempt,
} from "@repo/shared";
import { DIFFICULTIES } from "@repo/shared/vocabulary";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { apiRequest, type CallOptions } from "@repo/web-core/api/client";

/**
 * Quiz mode (docs/specs/10-secondary-features.md §1). Each schema mirrors the
 * one in @repo/shared; the type annotation keeps them in step.
 */

export const examTopicListSchema: z.ZodMiniType<ExamTopicList> = z.object({
  items: z.array(
    z.object({ id: z.string(), title: z.string(), questionCount: z.number() }),
  ),
});

const topic = z.object({ id: z.string(), title: z.string() });
const question = {
  topicId: z.string(),
  id: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  prompt: z.string(),
  options: z.array(z.string()),
};
const base = {
  id: z.string(),
  topics: z.array(topic),
  total: z.number(),
  startedAt: z.string(),
  expiresAt: z.string(),
};

export const openExamAttemptSchema: z.ZodMiniType<OpenExamAttempt> = z.object({
  ...base,
  status: z.enum(["in_progress", "expired"]),
  questions: z.array(z.object(question)),
});

export const submittedExamAttemptSchema: z.ZodMiniType<SubmittedExamAttempt> = z.object({
  ...base,
  status: z.literal("submitted"),
  score: z.number(),
  submittedAt: z.string(),
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

export const examAttemptSchema: z.ZodMiniType<ExamAttempt> = z.union([
  openExamAttemptSchema,
  submittedExamAttemptSchema,
]);

export const examAttemptListSchema: z.ZodMiniType<ExamAttemptList> = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      topics: z.array(topic),
      status: z.enum(["in_progress", "submitted", "expired"]),
      score: z.nullable(z.number()),
      total: z.number(),
      startedAt: z.string(),
      submittedAt: z.nullable(z.string()),
    }),
  ),
  nextCursor: z.nullable(z.string()),
});

export function getExamTopics(options: CallOptions = {}): Promise<ExamTopicList> {
  return apiRequest("/v1/exams/topics", examTopicListSchema, options);
}

export function startExamAttempt(
  body: CreateExamAttempt,
  options: CallOptions = {},
): Promise<OpenExamAttempt> {
  return apiRequest("/v1/exams/attempts", openExamAttemptSchema, {
    ...options,
    method: "POST",
    body,
  });
}

export function submitExamAttempt(
  id: string,
  answers: (number | null)[],
  options: CallOptions = {},
): Promise<SubmittedExamAttempt> {
  return apiRequest(
    `/v1/exams/attempts/${encodeURIComponent(id)}/submit`,
    submittedExamAttemptSchema,
    { ...options, method: "POST", body: { answers } },
  );
}

export function getExamAttempt(
  id: string,
  options: CallOptions = {},
): Promise<ExamAttempt> {
  return apiRequest(
    `/v1/exams/attempts/${encodeURIComponent(id)}`,
    examAttemptSchema,
    options,
  );
}

export function getExamAttempts(
  cursor: string | null,
  options: CallOptions = {},
): Promise<ExamAttemptList> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return apiRequest(`/v1/exams/attempts${query}`, examAttemptListSchema, options);
}
