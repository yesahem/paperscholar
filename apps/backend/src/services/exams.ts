import type { ContentStore } from "@repo/content";
import {
  and,
  desc,
  eq,
  gt,
  isNull,
  lt,
  or,
  schema,
  type Database,
  type StoredExamQuestion,
} from "@repo/db";
import {
  examDurationSeconds,
  type CreateExamAttempt,
  type ExamAttempt,
  type ExamAttemptList,
  type ExamAttemptStatus,
  type ExamAttemptSummary,
  type ExamTopicList,
  type ListExamAttemptsQuery,
  type OpenExamAttempt,
  type SubmitExamAttempt,
  type SubmittedExamAttempt,
} from "@repo/shared";
import type { Logger } from "@repo/shared/logger";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { AppError } from "../lib/errors";
import type { RateLimiter } from "./rate-limiter";
import { utcDay } from "./submissions";

type AttemptRow = typeof schema.examAttempts.$inferSelect;

const DAY_SECONDS = 86_400;

export interface ExamsDependencies {
  db: Database;
  content: ContentStore;
  limiter: RateLimiter;
  /** Quiz attempts per user per UTC day. */
  attemptsPerDay: number;
  logger: Logger;
  now?: () => Date;
  /** A number in [0, 1); replaced in tests to make the draw predictable. */
  random?: () => number;
}

export interface Exams {
  listTopics(): Promise<ExamTopicList>;
  /** Draws the questions and records the attempt. Answers stay on the server. */
  start(userId: string, input: CreateExamAttempt): Promise<OpenExamAttempt>;
  /** Grades once; a second submit, or one after expiry, is `409 conflict`. */
  submit(
    userId: string,
    attemptId: string,
    input: SubmitExamAttempt,
  ): Promise<SubmittedExamAttempt>;
  /** The caller's own attempt; anyone else's is `not_found`. */
  get(userId: string, attemptId: string): Promise<ExamAttempt>;
  list(userId: string, query: ListExamAttemptsQuery): Promise<ExamAttemptList>;
}

/** A cryptographically random number in [0, 1). */
function secureRandom(): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value / 2 ** 32;
}

/** `count` items of `pool` in random order (a partial Fisher–Yates shuffle). */
export function drawQuestions<T>(
  pool: readonly T[],
  count: number,
  random: () => number,
): T[] {
  const items = [...pool];
  const take = Math.min(count, items.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(random() * (items.length - i));
    const picked = items[j];
    const current = items[i];
    if (picked === undefined || current === undefined) break;
    items[i] = picked;
    items[j] = current;
  }
  return items.slice(0, take);
}

type SummaryRow = Pick<
  AttemptRow,
  "id" | "topics" | "score" | "total" | "startedAt" | "expiresAt" | "submittedAt"
>;

function statusOf(row: SummaryRow, now: Date): ExamAttemptStatus {
  if (row.submittedAt) return "submitted";
  return row.expiresAt <= now ? "expired" : "in_progress";
}

/** Questions as learners see them before grading: no answer, no explanation. */
function servedQuestions(row: AttemptRow) {
  return row.questions.map(({ topicId, id, difficulty, prompt, options }) => ({
    topicId,
    id,
    difficulty,
    prompt,
    options,
  }));
}

/** Grades `answers` against the stored questions. */
export function grade(
  questions: readonly StoredExamQuestion[],
  answers: readonly (number | null)[],
): { score: number; correct: boolean[] } {
  const correct = questions.map((question, index) => answers[index] === question.answer);
  return { score: correct.filter(Boolean).length, correct };
}

function toAttempt(row: AttemptRow, now: Date): ExamAttempt {
  const base = {
    id: row.id,
    topics: row.topics,
    total: row.total,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
  if (row.submittedAt && row.answers && row.score !== null) {
    const answers = row.answers;
    return {
      ...base,
      status: "submitted",
      score: row.score,
      submittedAt: row.submittedAt.toISOString(),
      questions: row.questions.map((question, index) => {
        const chosen = answers[index] ?? null;
        return {
          topicId: question.topicId,
          id: question.id,
          difficulty: question.difficulty,
          prompt: question.prompt,
          options: question.options,
          chosen,
          answer: question.answer,
          correct: chosen === question.answer,
          explanation: question.explanation,
        };
      }),
    };
  }
  return {
    ...base,
    status: row.expiresAt <= now ? "expired" : "in_progress",
    questions: servedQuestions(row),
  };
}

function toSummary(row: SummaryRow, now: Date): ExamAttemptSummary {
  return {
    id: row.id,
    topics: row.topics,
    status: statusOf(row, now),
    score: row.score,
    total: row.total,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}

/** Quiz mode (docs/specs/10-secondary-features.md §1): server-graded attempts. */
export function createExams({
  db,
  content,
  limiter,
  attemptsPerDay,
  logger,
  now = () => new Date(),
  random = secureRandom,
}: ExamsDependencies): Exams {
  const table = schema.examAttempts;

  async function ownRow(userId: string, attemptId: string): Promise<AttemptRow> {
    const [row] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, attemptId), eq(table.userId, userId)))
      .limit(1);
    if (!row) throw new AppError("not_found");
    return row;
  }

  return {
    async listTopics() {
      const index = await content.exams.getIndex();
      return {
        items: index.topics.map(({ id, title, questionCount }) => ({
          id,
          title,
          questionCount,
        })),
      };
    },

    async start(userId, { topics, count }) {
      const pool: StoredExamQuestion[] = [];
      const chosen: { id: string; title: string }[] = [];
      const unknown: { path: string; message: string }[] = [];
      for (const [position, topicId] of topics.entries()) {
        const topic = await content.exams.getTopic(topicId);
        if (!topic) {
          unknown.push({
            path: `topics.${position}`,
            message: "is not a quiz topic on this site",
          });
          continue;
        }
        chosen.push({ id: topicId, title: topic.public.title });
        const answers = new Map(
          topic.private.questions.map((question) => [question.id, question]),
        );
        for (const question of topic.public.questions) {
          const key = answers.get(question.id);
          if (!key) continue;
          pool.push({
            topicId,
            id: question.id,
            difficulty: question.difficulty,
            prompt: question.prompt,
            options: question.options,
            answer: key.answer,
            explanation: key.explanation,
          });
        }
      }
      if (unknown.length > 0) {
        throw new AppError("validation_error", { details: { issues: unknown } });
      }

      // Counted only once the request is valid, so a mistake costs nothing.
      const day = utcDay(now());
      const quota = await limiter.consume(`exams:user:${userId}`, {
        windowSeconds: DAY_SECONDS,
        max: attemptsPerDay,
      });
      if (!quota.allowed) {
        throw new AppError("quota_exceeded", {
          message: `You have started today's ${attemptsPerDay} quizzes. They reset at midnight UTC.`,
          details: { resetsAt: day.end.toISOString() },
          retryAfterSeconds: quota.retryAfterSeconds ?? DAY_SECONDS,
        });
      }

      const questions = drawQuestions(pool, count, random);
      const startedAt = now();
      const [row] = await db
        .insert(table)
        .values({
          id: Bun.randomUUIDv7(),
          userId,
          topics: chosen,
          questions,
          total: questions.length,
          startedAt,
          expiresAt: new Date(
            startedAt.getTime() + examDurationSeconds(questions.length) * 1000,
          ),
        })
        .returning();
      if (!row) throw new Error("The attempt was not recorded");
      logger.info("exam attempt started", {
        attemptId: row.id,
        userId,
        topics,
        total: row.total,
      });
      return {
        id: row.id,
        topics: row.topics,
        total: row.total,
        startedAt: row.startedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        status: "in_progress",
        questions: servedQuestions(row),
      };
    },

    async submit(userId, attemptId, { answers }) {
      const row = await ownRow(userId, attemptId);
      const at = now();
      if (row.submittedAt) {
        throw new AppError("conflict", { message: "This quiz has already been graded." });
      }
      if (row.expiresAt <= at) {
        throw new AppError("conflict", { message: "Time ran out on this quiz." });
      }

      const issues: { path: string; message: string }[] = [];
      if (answers.length !== row.total) {
        issues.push({
          path: "answers",
          message: `must have one entry per question (${row.total})`,
        });
      }
      for (const [index, answer] of answers.entries()) {
        const question = row.questions[index];
        if (answer !== null && question && answer >= question.options.length) {
          issues.push({
            path: `answers.${index}`,
            message: "is not one of the question's options",
          });
        }
      }
      if (issues.length > 0) {
        throw new AppError("validation_error", { details: { issues } });
      }

      const { score } = grade(row.questions, answers);
      // Only the first submit before expiry matches; a racing second one updates nothing.
      const [graded] = await db
        .update(table)
        .set({ answers: [...answers], score, submittedAt: at })
        .where(
          and(
            eq(table.id, attemptId),
            eq(table.userId, userId),
            isNull(table.submittedAt),
            gt(table.expiresAt, at),
          ),
        )
        .returning();
      if (!graded) {
        throw new AppError("conflict", { message: "This quiz has already been graded." });
      }
      logger.info("exam attempt graded", {
        attemptId,
        userId,
        score,
        total: graded.total,
      });
      const attempt = toAttempt(graded, at);
      if (attempt.status !== "submitted")
        throw new Error("A graded attempt has no grade");
      return attempt;
    },

    async get(userId, attemptId) {
      return toAttempt(await ownRow(userId, attemptId), now());
    },

    async list(userId, { limit, cursor }) {
      const after = cursor === undefined ? null : decodeCursor(cursor);
      // The questions are left out: a history row needs only the score.
      const rows = await db
        .select({
          id: table.id,
          topics: table.topics,
          score: table.score,
          total: table.total,
          startedAt: table.startedAt,
          expiresAt: table.expiresAt,
          submittedAt: table.submittedAt,
        })
        .from(table)
        .where(
          and(
            eq(table.userId, userId),
            after === null
              ? undefined
              : or(
                  lt(table.startedAt, after.at),
                  and(eq(table.startedAt, after.at), lt(table.id, after.id)),
                ),
          ),
        )
        .orderBy(desc(table.startedAt), desc(table.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const at = now();
      return {
        items: page.map((row) => toSummary(row, at)),
        nextCursor:
          rows.length > limit && last ? encodeCursor(last.startedAt, last.id) : null,
      };
    },
  };
}
