import { schema, sql, type Database, type SQL } from "@repo/db";
import type { LeaderboardPage, LeaderboardQuery, LeaderboardSort } from "@repo/shared";

export interface LeaderboardDependencies {
  db: Database;
  /** The URL of a stored avatar. */
  avatarUrl: (key: string) => string;
}

const stats = schema.userStats;

/**
 * Each order matches an index on `user_stats` exactly, so a page is an index
 * scan (docs/specs/04-database.md §4). Ties are broken by the earlier last
 * solve, then by user id, so every user has one position.
 */
const ORDER: Record<LeaderboardSort, SQL> = {
  problems_solved: sql`${stats.problemsSolved} desc nulls last, ${stats.lastSolvedAt} asc, ${stats.userId} asc`,
  papers_completed: sql`${stats.papersCompleted} desc nulls last, ${stats.lastSolvedAt} asc, ${stats.userId} asc`,
  recent_activity: sql`${stats.lastSolvedAt} desc nulls last, ${stats.userId} asc`,
};

/**
 * Whether user `s` is ahead of user `me` in `sort`, written against the same
 * order as `ORDER`. Both are aliases of `user_stats` in the rank query.
 */
const AHEAD: Record<LeaderboardSort, SQL> = {
  problems_solved: sql`(s.problems_solved > me.problems_solved
    or (s.problems_solved = me.problems_solved and s.last_solved_at < me.last_solved_at)
    or (s.problems_solved = me.problems_solved and s.last_solved_at = me.last_solved_at and s.user_id < me.user_id))`,
  papers_completed: sql`(s.papers_completed > me.papers_completed
    or (s.papers_completed = me.papers_completed and s.last_solved_at < me.last_solved_at)
    or (s.papers_completed = me.papers_completed and s.last_solved_at = me.last_solved_at and s.user_id < me.user_id))`,
  recent_activity: sql`(s.last_solved_at > me.last_solved_at
    or (s.last_solved_at = me.last_solved_at and s.user_id < me.user_id))`,
};

/** Rankings (docs/specs/05-api.md §7). Users who have solved nothing are not listed. */
export function createLeaderboard({ db, avatarUrl }: LeaderboardDependencies) {
  const listed = sql`${stats.problemsSolved} > 0`;

  return {
    async page({ sort, limit, offset }: LeaderboardQuery): Promise<LeaderboardPage> {
      const [rows, totals] = await Promise.all([
        db
          .select({
            username: schema.user.username,
            avatarKey: schema.profiles.avatarKey,
            problemsSolved: stats.problemsSolved,
            papersCompleted: stats.papersCompleted,
            lastSolvedAt: stats.lastSolvedAt,
          })
          .from(stats)
          .innerJoin(schema.user, sql`${schema.user.id} = ${stats.userId}`)
          .leftJoin(schema.profiles, sql`${schema.profiles.userId} = ${stats.userId}`)
          .where(listed)
          .orderBy(ORDER[sort])
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(stats)
          .where(listed),
      ]);
      return {
        sort,
        total: totals[0]?.total ?? 0,
        items: rows.map((row, index) => ({
          rank: offset + index + 1,
          username: row.username ?? "",
          avatarUrl: row.avatarKey ? avatarUrl(row.avatarKey) : null,
          problemsSolved: row.problemsSolved,
          papersCompleted: row.papersCompleted,
          lastSolvedAt: row.lastSolvedAt?.toISOString() ?? null,
        })),
      };
    },

    /** The user's position in `sort`, or null when they are not on the board. */
    async rank(userId: string, sort: LeaderboardSort): Promise<number | null> {
      const rows = await db.execute<{ ahead: number }>(sql`
        select count(s.user_id)::int as ahead
        from user_stats me
        left join user_stats s on s.problems_solved > 0 and ${AHEAD[sort]}
        where me.user_id = ${userId} and me.problems_solved > 0
        group by me.user_id
      `);
      const row = rows[0];
      return row === undefined ? null : row.ahead + 1;
    },
  };
}

export type Leaderboard = ReturnType<typeof createLeaderboard>;
