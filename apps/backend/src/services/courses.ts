import { videoObjectKey, type ContentStore, type Course } from "@repo/content";
import { and, eq, schema, sql, type Database } from "@repo/db";
import {
  PLAYBACK_URL_SECONDS,
  type CourseDetail,
  type CourseList,
  type CourseProgress,
  type Exercise,
  type ExerciseResult,
  type ItemProgress,
  type Note,
  type Playback,
  type PutProgress,
} from "@repo/shared";
import type { ObjectStorage } from "@repo/storage";
import { AppError } from "../lib/errors";
import type { MediaUrls } from "./media";

type ProgressRow = typeof schema.courseProgress.$inferSelect;
type PublicItem = Course["public"]["items"][number];

export interface CoursesDependencies {
  db: Database;
  content: ContentStore;
  storage: ObjectStorage;
  media: MediaUrls;
  now?: () => Date;
}

export interface Courses {
  list(): Promise<CourseList>;
  get(courseId: string): Promise<CourseDetail>;
  playback(courseId: string, itemId: string): Promise<Playback>;
  exercise(courseId: string, itemId: string): Promise<Exercise>;
  submitExercise(
    userId: string,
    courseId: string,
    itemId: string,
    answers: readonly (number | null)[],
  ): Promise<ExerciseResult>;
  progress(userId: string, courseId: string): Promise<CourseProgress>;
  putProgress(
    userId: string,
    courseId: string,
    itemId: string,
    input: PutProgress,
  ): Promise<ItemProgress>;
  note(userId: string, courseId: string, itemId: string): Promise<Note>;
  putNote(userId: string, courseId: string, itemId: string, body: string): Promise<Note>;
}

const invalid = (path: string, message: string) =>
  new AppError("validation_error", { details: { issues: [{ path, message }] } });

function toItemProgress(row: ProgressRow): ItemProgress {
  return {
    itemId: row.itemId,
    completed: row.completed,
    lastWatchedSeconds: row.lastWatchedSeconds,
    score: row.score,
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Courses (docs/specs/10-secondary-features.md §5). Every item is open to any
 * signed-in user; videos are served through short-lived URLs, and exercise
 * answers stay on the server until the exercise is submitted.
 */
export function createCourses({
  db,
  content,
  storage,
  media,
  now = () => new Date(),
}: CoursesDependencies): Courses {
  const progressTable = schema.courseProgress;
  const notesTable = schema.courseNotes;

  async function course(courseId: string): Promise<Course> {
    const found = await content.courses.get(courseId);
    if (!found) throw new AppError("not_found");
    return found;
  }

  async function item(
    courseId: string,
    itemId: string,
  ): Promise<{ course: Course; item: PublicItem }> {
    const found = await course(courseId);
    const match = found.public.items.find((candidate) => candidate.id === itemId);
    if (!match) throw new AppError("not_found");
    return { course: found, item: match };
  }

  async function exerciseParts(courseId: string, itemId: string) {
    const { course: found, item: match } = await item(courseId, itemId);
    if (match.type !== "exercise") throw new AppError("not_found");
    const key = found.private.items.find((candidate) => candidate.id === itemId);
    if (key?.type !== "exercise") throw new AppError("not_found");
    return { item: match, answers: key.answers };
  }

  return {
    async list() {
      const entries = await content.courses.list();
      return {
        items: entries.map(
          ({ id, title, summary, lectureCount, exerciseCount, durationSeconds }) => ({
            id,
            title,
            summary,
            lectureCount,
            exerciseCount,
            durationSeconds,
          }),
        ),
      };
    },

    async get(courseId) {
      const entry = await content.courses.getEntry(courseId);
      const found = await course(courseId);
      if (!entry) throw new AppError("not_found");
      return {
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        lectureCount: entry.lectureCount,
        exerciseCount: entry.exerciseCount,
        durationSeconds: entry.durationSeconds,
        items: found.public.items.map((candidate) =>
          candidate.type === "lecture"
            ? candidate
            : {
                id: candidate.id,
                type: candidate.type,
                title: candidate.title,
                questionCount: candidate.questions.length,
              },
        ),
      };
    },

    async playback(courseId, itemId) {
      const { course: found, item: match } = await item(courseId, itemId);
      const lecture = found.private.items.find((candidate) => candidate.id === itemId);
      if (match.type !== "lecture" || lecture?.type !== "lecture") {
        throw new AppError("not_found");
      }
      const key = videoObjectKey(lecture.videoKey);
      if (!(await storage.head(key))) {
        throw new AppError("not_found", {
          message: "This lecture's video is not available yet.",
        });
      }
      return {
        url: await media.urlFor(key, PLAYBACK_URL_SECONDS),
        expiresInSeconds: PLAYBACK_URL_SECONDS,
      };
    },

    async exercise(courseId, itemId) {
      const { item: match } = await exerciseParts(courseId, itemId);
      return { itemId: match.id, title: match.title, questions: match.questions };
    },

    async submitExercise(userId, courseId, itemId, answers) {
      const { item: match, answers: key } = await exerciseParts(courseId, itemId);
      const questions = match.questions;
      if (answers.length !== questions.length) {
        throw invalid(
          "answers",
          `must have one entry per question (${questions.length})`,
        );
      }
      for (const [index, answer] of answers.entries()) {
        const question = questions[index];
        if (answer !== null && question && answer >= question.options.length) {
          throw invalid(`answers.${index}`, "is not one of the question's options");
        }
      }
      const graded = questions.map((question, index) => {
        const right = key.find((candidate) => candidate.id === question.id);
        if (!right)
          throw new Error(
            `Exercise ${courseId}/${itemId} has no answer for ${question.id}`,
          );
        const chosen = answers[index] ?? null;
        return {
          ...question,
          chosen,
          answer: right.answer,
          correct: chosen === right.answer,
          explanation: right.explanation,
        };
      });
      const score = graded.filter((question) => question.correct).length;
      const at = now();
      // Submitting completes the exercise; the best score is kept.
      await db
        .insert(progressTable)
        .values({
          userId,
          courseId,
          itemId,
          completed: true,
          score,
          completedAt: at,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: [progressTable.userId, progressTable.courseId, progressTable.itemId],
          set: {
            completed: true,
            score: sql`greatest(coalesce(${progressTable.score}, 0), excluded.score)`,
            completedAt: sql`coalesce(${progressTable.completedAt}, excluded.completed_at)`,
            updatedAt: at,
          },
        });
      return { itemId, score, total: questions.length, questions: graded };
    },

    async progress(userId, courseId) {
      const found = await course(courseId);
      const ids = new Set(found.public.items.map((candidate) => candidate.id));
      const rows = await db
        .select()
        .from(progressTable)
        .where(
          and(eq(progressTable.userId, userId), eq(progressTable.courseId, courseId)),
        );
      return {
        courseId,
        // Items removed from the course since are left out.
        items: rows.filter((row) => ids.has(row.itemId)).map(toItemProgress),
      };
    },

    async putProgress(userId, courseId, itemId, { completed, lastWatchedSeconds }) {
      const { item: match } = await item(courseId, itemId);
      if (match.type !== "lecture") {
        throw invalid("completed", "an exercise is completed by submitting it");
      }
      const position = Math.min(lastWatchedSeconds, match.durationSeconds);
      const at = now();
      const [row] = await db
        .insert(progressTable)
        .values({
          userId,
          courseId,
          itemId,
          completed,
          lastWatchedSeconds: position,
          completedAt: completed ? at : null,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: [progressTable.userId, progressTable.courseId, progressTable.itemId],
          // A completed lecture stays completed, whatever a later report says.
          set: {
            completed: sql`${progressTable.completed} or excluded.completed`,
            completedAt: sql`coalesce(${progressTable.completedAt}, excluded.completed_at)`,
            lastWatchedSeconds: position,
            updatedAt: at,
          },
        })
        .returning();
      if (!row) throw new Error("The progress was not recorded");
      return toItemProgress(row);
    },

    async note(userId, courseId, itemId) {
      await item(courseId, itemId);
      const [row] = await db
        .select()
        .from(notesTable)
        .where(
          and(
            eq(notesTable.userId, userId),
            eq(notesTable.courseId, courseId),
            eq(notesTable.itemId, itemId),
          ),
        )
        .limit(1);
      return { body: row?.body ?? "", updatedAt: row?.updatedAt.toISOString() ?? null };
    },

    async putNote(userId, courseId, itemId, body) {
      await item(courseId, itemId);
      const where = and(
        eq(notesTable.userId, userId),
        eq(notesTable.courseId, courseId),
        eq(notesTable.itemId, itemId),
      );
      if (body.trim() === "") {
        await db.delete(notesTable).where(where);
        return { body: "", updatedAt: null };
      }
      const at = now();
      const [row] = await db
        .insert(notesTable)
        .values({ userId, courseId, itemId, body, updatedAt: at })
        .onConflictDoUpdate({
          target: [notesTable.userId, notesTable.courseId, notesTable.itemId],
          set: { body, updatedAt: at },
        })
        .returning();
      if (!row) throw new Error("The note was not saved");
      return { body: row.body, updatedAt: row.updatedAt.toISOString() };
    },
  };
}
