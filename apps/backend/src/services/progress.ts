import {
  and,
  asc,
  type AnyColumn,
  eq,
  inArray,
  schema,
  sql,
  type Database,
  type Transaction,
} from "@repo/db";
import type { Difficulty, ProgressList, SubmissionMode, Verdict } from "@repo/shared";
import type { Logger } from "@repo/shared/logger";

const DAY_MS = 86_400_000;

/** The UTC calendar day of `at`, as `YYYY-MM-DD` (docs/specs/04-database.md §5.2). */
export function utcDayString(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The day before `day` (`YYYY-MM-DD`). */
export function previousDay(day: string): string {
  return utcDayString(new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS));
}

export interface Streak {
  current: number;
  longest: number;
  lastActiveDay: string | null;
}

/**
 * The streak after a passed submit on `today` (docs/specs/04-database.md
 * §5.1 step 5): unchanged on a day already counted, one longer after
 * yesterday, otherwise a new streak of one.
 */
export function advanceStreak(streak: Streak, today: string): Streak {
  if (streak.lastActiveDay === today) return streak;
  const current =
    streak.lastActiveDay !== null && streak.lastActiveDay === previousDay(today)
      ? streak.current + 1
      : 1;
  return {
    current,
    longest: Math.max(streak.longest, current),
    lastActiveDay: today,
  };
}

/** A finished submission, as the solve transaction needs it. */
export interface FinishedSubmission {
  submissionId: string;
  userId: string;
  paperId: string;
  problemId: string;
  mode: SubmissionMode;
  verdict: Verdict;
  /** The problem's difficulty in the graded version. */
  difficulty: Difficulty;
  /** Published problems of the paper now, from the cached index. */
  paperProblemIds: readonly string[];
  finishedAt: Date;
}

export interface RecordedOutcome {
  /** This submission solved the problem for the first time. */
  firstSolve: boolean;
  /** This submission completed the paper. */
  paperCompleted: boolean;
}

const increment = (column: AnyColumn) => sql`${column} + 1`;

/** The `user_stats` counter of one difficulty, incremented. */
function difficultyIncrement(difficulty: Difficulty) {
  const stats = schema.userStats;
  switch (difficulty) {
    case "easy":
      return { easySolved: increment(stats.easySolved) };
    case "medium":
      return { mediumSolved: increment(stats.mediumSolved) };
    case "hard":
      return { hardSolved: increment(stats.hardSolved) };
  }
}

/**
 * Records what a finished submission means for the learner, inside the
 * transaction that stores its result (docs/specs/04-database.md §5.1). An
 * `internal_error` changes nothing. Any other verdict counts towards the
 * day's submissions; a passed submit also records the solve, the paper's
 * completion, the day's solves and the streak.
 */
export async function recordFinished(
  tx: Transaction,
  submission: FinishedSubmission,
): Promise<RecordedOutcome> {
  const none: RecordedOutcome = { firstSolve: false, paperCompleted: false };
  if (submission.verdict === "internal_error") return none;

  const { userId, paperId, problemId, finishedAt } = submission;
  const day = utcDayString(finishedAt);
  const activity = schema.dailyActivity;
  const passedSubmit = submission.mode === "submit" && submission.verdict === "passed";

  if (!passedSubmit) {
    await tx
      .insert(activity)
      .values({ userId, day, submissions: 1 })
      .onConflictDoUpdate({
        target: [activity.userId, activity.day],
        set: { submissions: sql`${activity.submissions} + 1`, updatedAt: finishedAt },
      });
    return none;
  }

  const solved = await tx
    .insert(schema.progress)
    .values({
      userId,
      paperId,
      problemId,
      difficulty: submission.difficulty,
      firstSubmissionId: submission.submissionId,
      solvedAt: finishedAt,
    })
    .onConflictDoNothing()
    .returning({ problemId: schema.progress.problemId });
  const firstSolve = solved.length > 0;

  let paperCompleted = false;
  const published = submission.paperProblemIds;
  if (firstSolve && published.length > 0 && published.includes(problemId)) {
    const [row] = await tx
      .select({ solved: sql<number>`count(*)::int` })
      .from(schema.progress)
      .where(
        and(
          eq(schema.progress.userId, userId),
          eq(schema.progress.paperId, paperId),
          inArray(schema.progress.problemId, [...published]),
        ),
      );
    if ((row?.solved ?? 0) === published.length) {
      const completed = await tx
        .insert(schema.paperCompletions)
        .values({ userId, paperId, completedAt: finishedAt })
        .onConflictDoNothing()
        .returning({ paperId: schema.paperCompletions.paperId });
      paperCompleted = completed.length > 0;
    }
  }

  await tx
    .insert(activity)
    .values({
      userId,
      day,
      submissions: 1,
      passedSubmits: 1,
      newSolves: firstSolve ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [activity.userId, activity.day],
      set: {
        submissions: sql`${activity.submissions} + 1`,
        passedSubmits: sql`${activity.passedSubmits} + 1`,
        newSolves: sql`${activity.newSolves} + ${firstSolve ? 1 : 0}`,
        updatedAt: finishedAt,
      },
    });

  // The row may be missing: the sign-up hook does not share the user's
  // transaction (docs/specs/04-database.md §5.2). Locked so the counters and
  // the streak are read and written as one step.
  const stats = schema.userStats;
  await tx.insert(stats).values({ userId }).onConflictDoNothing();
  const [current] = await tx
    .select({
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      lastActiveDay: stats.lastActiveDay,
    })
    .from(stats)
    .where(eq(stats.userId, userId))
    .for("update");
  const streak = advanceStreak(
    {
      current: current?.currentStreak ?? 0,
      longest: current?.longestStreak ?? 0,
      lastActiveDay: current?.lastActiveDay ?? null,
    },
    day,
  );
  await tx
    .update(stats)
    .set({
      currentStreak: streak.current,
      longestStreak: streak.longest,
      lastActiveDay: streak.lastActiveDay,
      updatedAt: finishedAt,
      ...(firstSolve
        ? {
            problemsSolved: increment(stats.problemsSolved),
            ...difficultyIncrement(submission.difficulty),
            lastSolvedAt: finishedAt,
          }
        : {}),
      ...(paperCompleted ? { papersCompleted: increment(stats.papersCompleted) } : {}),
    })
    .where(eq(stats.userId, userId));

  return { firstSolve, paperCompleted };
}

/** `GET /v1/progress`: every problem the user has solved, oldest first. */
export async function listSolves(db: Database, userId: string): Promise<ProgressList> {
  const rows = await db
    .select({
      paperId: schema.progress.paperId,
      problemId: schema.progress.problemId,
      solvedAt: schema.progress.solvedAt,
    })
    .from(schema.progress)
    .where(eq(schema.progress.userId, userId))
    .orderBy(asc(schema.progress.solvedAt), asc(schema.progress.paperId));
  return {
    items: rows.map((row) => ({
      paperId: row.paperId,
      problemId: row.problemId,
      solvedAt: row.solvedAt.toISOString(),
    })),
  };
}

/** One counter of `user_stats` that disagrees with `progress` or `paper_completions`. */
export interface StatsDrift {
  userId: string;
  field: string;
  stored: number;
  derived: number;
}

/** How many users the nightly drift check looks at. */
export const STATS_DRIFT_SAMPLE = 200;

/**
 * Recomputes the solve counters of a random sample of users from `progress`
 * and `paper_completions`, and logs every disagreement
 * (docs/specs/04-database.md §5.2). Counters are a cache of derivable truth;
 * this is how a bug in the solve transaction would show itself.
 */
export async function checkStatsDrift(
  db: Database,
  logger: Logger,
  sample: number = STATS_DRIFT_SAMPLE,
): Promise<StatsDrift[]> {
  const rows = await db.execute<{
    user_id: string;
    problems_solved: number;
    easy_solved: number;
    medium_solved: number;
    hard_solved: number;
    papers_completed: number;
    derived_solved: number;
    derived_easy: number;
    derived_medium: number;
    derived_hard: number;
    derived_papers: number;
  }>(sql`
    with sampled as (
      select * from user_stats order by random() limit ${sample}
    )
    select
      s.user_id,
      s.problems_solved, s.easy_solved, s.medium_solved, s.hard_solved, s.papers_completed,
      (select count(*)::int from progress p where p.user_id = s.user_id) as derived_solved,
      (select count(*)::int from progress p where p.user_id = s.user_id and p.difficulty = 'easy') as derived_easy,
      (select count(*)::int from progress p where p.user_id = s.user_id and p.difficulty = 'medium') as derived_medium,
      (select count(*)::int from progress p where p.user_id = s.user_id and p.difficulty = 'hard') as derived_hard,
      (select count(*)::int from paper_completions c where c.user_id = s.user_id) as derived_papers
    from sampled s
  `);

  const drift: StatsDrift[] = [];
  for (const row of rows) {
    const pairs: [string, number, number][] = [
      ["problemsSolved", row.problems_solved, row.derived_solved],
      ["easySolved", row.easy_solved, row.derived_easy],
      ["mediumSolved", row.medium_solved, row.derived_medium],
      ["hardSolved", row.hard_solved, row.derived_hard],
      ["papersCompleted", row.papers_completed, row.derived_papers],
    ];
    for (const [field, stored, derived] of pairs) {
      if (stored !== derived) drift.push({ userId: row.user_id, field, stored, derived });
    }
  }
  for (const entry of drift) logger.warn("user stats drift", { ...entry });
  return drift;
}
