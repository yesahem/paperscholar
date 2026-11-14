import { z } from "zod";
import { normaliseUsername, USERNAME_MAX_LENGTH, USERNAME_PATTERN } from "../accounts";
import {
  LEADERBOARD_MAX_PAGE_SIZE,
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_SORTS,
  USER_SEARCH_MIN_LENGTH,
} from "../progress";

/** Contracts of the progress, profile and social endpoints (docs/specs/05-api.md §7). */

const isoTimestamp = z.string();
/** A UTC calendar day, `YYYY-MM-DD`. */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** `GET /v1/progress`: every problem the caller has solved. */
export const solveSchema = z.object({
  paperId: z.string(),
  problemId: z.string(),
  solvedAt: isoTimestamp,
});
export type Solve = z.infer<typeof solveSchema>;

export const progressListSchema = z.object({ items: z.array(solveSchema) });
export type ProgressList = z.infer<typeof progressListSchema>;

/** A user as lists show them: no email, no role. */
export const userCardSchema = z.object({
  username: z.string(),
  avatarUrl: z.string().nullable(),
});
export type UserCard = z.infer<typeof userCardSchema>;

/** `GET /v1/users?q=`. */
export const userSearchResultSchema = z.object({ items: z.array(userCardSchema) });
export type UserSearchResult = z.infer<typeof userSearchResultSchema>;

/** `GET /v1/users/:username/following`. */
export const userCardListSchema = z.object({
  items: z.array(userCardSchema),
  nextCursor: z.string().nullable(),
});
export type UserCardList = z.infer<typeof userCardListSchema>;

export const profileStatsSchema = z.object({
  problemsSolved: z.number().int(),
  papersCompleted: z.number().int(),
  easy: z.number().int(),
  medium: z.number().int(),
  hard: z.number().int(),
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),
});
export type ProfileStats = z.infer<typeof profileStatsSchema>;

export const paperProgressSchema = z.object({
  paperId: z.string(),
  solved: z.number().int(),
  total: z.number().int(),
  completedAt: isoTimestamp.nullable(),
});
export type PaperProgress = z.infer<typeof paperProgressSchema>;

export const activityDaySchema = z.object({ day: isoDay, solves: z.number().int() });
export type ActivityDay = z.infer<typeof activityDaySchema>;

/** `GET /v1/users/:username`. Never carries an email or a role. */
export const publicProfileSchema = z.object({
  username: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  joinedAt: isoTimestamp,
  stats: profileStatsSchema,
  papers: z.array(paperProgressSchema),
  activity: z.array(activityDaySchema),
  followingCount: z.number().int(),
  followerCount: z.number().int(),
  /** Null when signed out. */
  isFollowedByMe: z.boolean().nullable(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const leaderboardSortSchema = z.enum(LEADERBOARD_SORTS);

export const leaderboardEntrySchema = z.object({
  rank: z.number().int(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
  problemsSolved: z.number().int(),
  papersCompleted: z.number().int(),
  lastSolvedAt: isoTimestamp.nullable(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

/** `GET /v1/leaderboard`. */
export const leaderboardPageSchema = z.object({
  sort: leaderboardSortSchema,
  items: z.array(leaderboardEntrySchema),
  total: z.number().int(),
});
export type LeaderboardPage = z.infer<typeof leaderboardPageSchema>;

/** `GET /v1/leaderboard/me`: null when the caller is not on the board. */
export const leaderboardRankSchema = z.object({ rank: z.number().int().nullable() });
export type LeaderboardRank = z.infer<typeof leaderboardRankSchema>;

/** `POST /v1/me/avatar`. */
export const avatarUploadedSchema = z.object({ avatarUrl: z.string() });
export type AvatarUploaded = z.infer<typeof avatarUploadedSchema>;

const sortQuery = leaderboardSortSchema.default("problems_solved");

export const leaderboardQuerySchema = z.strictObject({
  sort: sortQuery,
  limit: z.coerce
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(1, "must be at least 1")
    .max(LEADERBOARD_MAX_PAGE_SIZE, `must be at most ${LEADERBOARD_MAX_PAGE_SIZE}`)
    .default(LEADERBOARD_PAGE_SIZE),
  offset: z.coerce
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(0, "must not be negative")
    .max(1_000_000, "is too large")
    .default(0),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const leaderboardRankQuerySchema = z.strictObject({ sort: sortQuery });

/** A username in a path: normalised the way usernames are stored. */
export const usernameParamsSchema = z.strictObject({
  username: z
    .string()
    .transform(normaliseUsername)
    .pipe(
      z
        .string()
        .max(USERNAME_MAX_LENGTH, "is not a username")
        .regex(USERNAME_PATTERN, "is not a username"),
    ),
});

export const userSearchQuerySchema = z.strictObject({
  q: z
    .string()
    .transform(normaliseUsername)
    .pipe(
      z
        .string()
        .min(
          USER_SEARCH_MIN_LENGTH,
          `must be at least ${USER_SEARCH_MIN_LENGTH} characters`,
        )
        .max(USERNAME_MAX_LENGTH, `must be at most ${USERNAME_MAX_LENGTH} characters`)
        .regex(USERNAME_PATTERN, "may contain only letters, digits and underscores"),
    ),
});

export const followingQuerySchema = z.strictObject({
  limit: z.coerce
    .number({ error: "must be a number" })
    .int("must be a whole number")
    .min(1, "must be at least 1")
    .max(100, "must be at most 100")
    .default(20),
  cursor: z.string().min(1).max(200).optional(),
});
export type FollowingQuery = z.infer<typeof followingQuerySchema>;
