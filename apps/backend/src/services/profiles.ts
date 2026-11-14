import type { ContentStore } from "@repo/content";
import { and, asc, desc, eq, gte, lt, or, schema, sql, type Database } from "@repo/db";
import {
  ACTIVITY_DAYS,
  USER_SEARCH_LIMIT,
  type FollowingQuery,
  type PaperProgress,
  type PublicProfile,
  type UserCardList,
  type UserSearchResult,
} from "@repo/shared";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { AppError } from "../lib/errors";
import { utcDayString } from "./progress";

const DAY_MS = 86_400_000;

export interface ProfilesDependencies {
  db: Database;
  content: ContentStore;
  /** The URL of a stored avatar. */
  avatarUrl: (key: string) => string;
  now?: () => Date;
}

/**
 * Public profiles and follows (docs/specs/05-api.md §7). Nothing here ever
 * returns an email address or a role.
 */
export function createProfiles({
  db,
  content,
  avatarUrl,
  now = () => new Date(),
}: ProfilesDependencies) {
  const url = (key: string | null) => (key ? avatarUrl(key) : null);

  /** The user with `username`, or `not_found`. */
  async function findUser(username: string) {
    const [row] = await db
      .select({
        id: schema.user.id,
        username: schema.user.username,
        createdAt: schema.user.createdAt,
        bio: schema.profiles.bio,
        avatarKey: schema.profiles.avatarKey,
      })
      .from(schema.user)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
      .where(eq(schema.user.username, username))
      .limit(1);
    if (!row) throw new AppError("not_found");
    return row;
  }

  /** Solved and total problems per paper the user has solved anything in. */
  async function paperProgress(userId: string): Promise<PaperProgress[]> {
    const [solved, completions, index] = await Promise.all([
      db
        .select({
          paperId: schema.progress.paperId,
          problemId: schema.progress.problemId,
          solvedAt: schema.progress.solvedAt,
        })
        .from(schema.progress)
        .where(eq(schema.progress.userId, userId)),
      db
        .select({
          paperId: schema.paperCompletions.paperId,
          completedAt: schema.paperCompletions.completedAt,
        })
        .from(schema.paperCompletions)
        .where(eq(schema.paperCompletions.userId, userId)),
      content.getIndex(),
    ]);

    const byPaper = new Map<string, { problems: Set<string>; latest: number }>();
    for (const row of solved) {
      const paper = byPaper.get(row.paperId) ?? { problems: new Set(), latest: 0 };
      paper.problems.add(row.problemId);
      paper.latest = Math.max(paper.latest, row.solvedAt.getTime());
      byPaper.set(row.paperId, paper);
    }
    const completedAt = new Map(
      completions.map((row) => [row.paperId, row.completedAt.toISOString()]),
    );
    const entries = new Map(index.papers.map((entry) => [entry.id, entry]));

    return [...byPaper.entries()]
      .sort(([a, left], [b, right]) => right.latest - left.latest || a.localeCompare(b))
      .map(([paperId, paper]) => {
        const published =
          entries
            .get(paperId)
            ?.problems.filter((problem) => problem.status === "published")
            .map((problem) => problem.id) ?? [];
        // Solves of retired problems still count; the total is what is open now.
        const solvedNow = published.filter((id) => paper.problems.has(id)).length;
        return {
          paperId,
          solved: published.length > 0 ? solvedNow : paper.problems.size,
          total: published.length > 0 ? published.length : paper.problems.size,
          completedAt: completedAt.get(paperId) ?? null,
        };
      });
  }

  return {
    async get(username: string, viewerId: string | null): Promise<PublicProfile> {
      const user = await findUser(username);
      const since = utcDayString(
        new Date(now().getTime() - (ACTIVITY_DAYS - 1) * DAY_MS),
      );
      const [stats, papers, activity, counts, followed] = await Promise.all([
        db
          .select()
          .from(schema.userStats)
          .where(eq(schema.userStats.userId, user.id))
          .limit(1),
        paperProgress(user.id),
        db
          .select({
            day: schema.dailyActivity.day,
            solves: schema.dailyActivity.passedSubmits,
          })
          .from(schema.dailyActivity)
          .where(
            and(
              eq(schema.dailyActivity.userId, user.id),
              gte(schema.dailyActivity.day, since),
              sql`${schema.dailyActivity.passedSubmits} > 0`,
            ),
          )
          .orderBy(asc(schema.dailyActivity.day)),
        db
          .select({
            following: sql<number>`count(*) filter (where ${schema.follows.followerId} = ${user.id})::int`,
            followers: sql<number>`count(*) filter (where ${schema.follows.followeeId} = ${user.id})::int`,
          })
          .from(schema.follows)
          .where(
            or(
              eq(schema.follows.followerId, user.id),
              eq(schema.follows.followeeId, user.id),
            ),
          ),
        viewerId === null
          ? Promise.resolve(null)
          : db
              .select({ followeeId: schema.follows.followeeId })
              .from(schema.follows)
              .where(
                and(
                  eq(schema.follows.followerId, viewerId),
                  eq(schema.follows.followeeId, user.id),
                ),
              )
              .limit(1),
      ]);
      const row = stats[0];
      return {
        username: user.username ?? username,
        avatarUrl: url(user.avatarKey),
        bio: user.bio,
        joinedAt: user.createdAt.toISOString(),
        stats: {
          problemsSolved: row?.problemsSolved ?? 0,
          papersCompleted: row?.papersCompleted ?? 0,
          easy: row?.easySolved ?? 0,
          medium: row?.mediumSolved ?? 0,
          hard: row?.hardSolved ?? 0,
          // A streak that missed yesterday has ended, even before the next solve resets it.
          currentStreak: liveStreak(
            row?.currentStreak ?? 0,
            row?.lastActiveDay ?? null,
            now(),
          ),
          longestStreak: row?.longestStreak ?? 0,
        },
        papers,
        activity,
        followingCount: counts[0]?.following ?? 0,
        followerCount: counts[0]?.followers ?? 0,
        isFollowedByMe: followed === null ? null : followed.length > 0,
      };
    },

    /** Idempotent. Following yourself is a `validation_error`. */
    async follow(followerId: string, username: string): Promise<void> {
      const followee = await findUser(username);
      if (followee.id === followerId) {
        throw new AppError("validation_error", {
          message: "You cannot follow yourself.",
          details: { issues: [{ path: "username", message: "is you" }] },
        });
      }
      await db
        .insert(schema.follows)
        .values({ followerId, followeeId: followee.id, createdAt: now() })
        .onConflictDoNothing();
    },

    /** Idempotent. */
    async unfollow(followerId: string, username: string): Promise<void> {
      const followee = await findUser(username);
      await db
        .delete(schema.follows)
        .where(
          and(
            eq(schema.follows.followerId, followerId),
            eq(schema.follows.followeeId, followee.id),
          ),
        );
    },

    /** Who `username` follows, most recent first. */
    async following(
      username: string,
      { limit, cursor }: FollowingQuery,
    ): Promise<UserCardList> {
      const user = await findUser(username);
      const after = cursor === undefined ? null : decodeCursor(cursor);
      const follows = schema.follows;
      const rows = await db
        .select({
          followeeId: follows.followeeId,
          createdAt: follows.createdAt,
          username: schema.user.username,
          avatarKey: schema.profiles.avatarKey,
        })
        .from(follows)
        .innerJoin(schema.user, eq(schema.user.id, follows.followeeId))
        .leftJoin(schema.profiles, eq(schema.profiles.userId, follows.followeeId))
        .where(
          and(
            eq(follows.followerId, user.id),
            after === null
              ? undefined
              : or(
                  lt(follows.createdAt, after.at),
                  and(eq(follows.createdAt, after.at), lt(follows.followeeId, after.id)),
                ),
          ),
        )
        .orderBy(desc(follows.createdAt), desc(follows.followeeId))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          username: row.username ?? "",
          avatarUrl: url(row.avatarKey),
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor(last.createdAt, last.followeeId)
            : null,
      };
    },

    /**
     * Up to ten users whose username starts with `prefix`, alphabetically.
     * `prefix` is already normalised and holds only username characters.
     */
    async search(prefix: string): Promise<UserSearchResult> {
      const rows = await db
        .select({ username: schema.user.username, avatarKey: schema.profiles.avatarKey })
        .from(schema.user)
        .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
        .where(sql`starts_with(${schema.user.username}, ${prefix})`)
        .orderBy(asc(schema.user.username))
        .limit(USER_SEARCH_LIMIT);
      return {
        items: rows.map((row) => ({
          username: row.username ?? "",
          avatarUrl: url(row.avatarKey),
        })),
      };
    },
  };
}

/**
 * The streak as of `now`: the stored one while its last day is today or
 * yesterday, otherwise zero. Stored streaks only change on a solve.
 */
export function liveStreak(
  current: number,
  lastActiveDay: string | null,
  now: Date,
): number {
  if (lastActiveDay === null) return 0;
  const today = utcDayString(now);
  const yesterday = utcDayString(new Date(now.getTime() - DAY_MS));
  return lastActiveDay === today || lastActiveDay === yesterday ? current : 0;
}

export type Profiles = ReturnType<typeof createProfiles>;
