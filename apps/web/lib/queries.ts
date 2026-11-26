"use client";

import type { LeaderboardSort } from "@repo/shared/progress";
import { sessionQueryKeys, useMe } from "@repo/web-core/queries/session";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getColdMail, getColdMails, getCvs } from "@/lib/api/cold-mail";
import { getCourseProgress, getExercise, getNote, getPlayback } from "@/lib/api/courses";
import { getExamAttempts, getExamTopics } from "@/lib/api/exams";
import { getMyFeedback, getReviews } from "@/lib/api/feedback";
import { getLeaderboard, getLeaderboardRank, getProgress } from "@/lib/api/progress";
import { getPaperTitles, getProfile } from "@/lib/api/users";
import { solvedKeys } from "@/lib/progress/solved";
import { ApiError } from "@repo/web-core/api/errors";

/** TanStack Query hooks, one per endpoint (docs/specs/08-web.md §3). */

export const queryKeys = {
  ...sessionQueryKeys,
  problemSubmissions: (paperId: string, problemId: string) =>
    ["submissions", paperId, problemId] as const,
  progress: ["progress"] as const,
  leaderboard: (sort: LeaderboardSort, offset: number) =>
    ["leaderboard", sort, offset] as const,
  leaderboardRank: (sort: LeaderboardSort) => ["leaderboard", "me", sort] as const,
  profile: (username: string) => ["profile", username] as const,
  following: (username: string) => ["following", username] as const,
  paperTitles: ["paper-titles"] as const,
  examTopics: ["exams", "topics"] as const,
  examAttempts: ["exams", "attempts"] as const,
  reviews: ["feedback", "reviews"] as const,
  myFeedback: ["feedback", "mine"] as const,
  courseProgress: (courseId: string) => ["courses", courseId, "progress"] as const,
  exercise: (courseId: string, itemId: string) =>
    ["courses", courseId, "exercise", itemId] as const,
  note: (courseId: string, itemId: string) =>
    ["courses", courseId, "note", itemId] as const,
  cvs: ["cv"] as const,
  coldMails: ["cold-mails"] as const,
  coldMail: (id: string) => ["cold-mails", id] as const,
  playback: (courseId: string, itemId: string) =>
    ["courses", courseId, "playback", itemId] as const,
};

/** Never retry an answer the API gave on purpose (a 4xx); retry network trouble twice. */
const retryUnlessRefused = (failures: number, error: Error) =>
  !(error instanceof ApiError && error.status !== null && error.status < 500) &&
  failures < 2;

/**
 * Everything the signed-in user has solved (`GET /v1/progress`), as a set of
 * `paperId/problemId`. Empty and idle while signed out. Invalidated after a
 * passed submit, so solved marks update everywhere (docs/specs/08-web.md §5.5).
 */
export function useProgress() {
  const me = useMe();
  const signedIn = Boolean(me.data);
  const query = useQuery({
    queryKey: queryKeys.progress,
    queryFn: ({ signal }) => getProgress({ signal }),
    enabled: signedIn,
    staleTime: 60_000,
    retry: retryUnlessRefused,
  });
  const solved = useMemo(() => solvedKeys(query.data?.items ?? []), [query.data]);
  return {
    signedIn,
    /** True until both the session and, when signed in, the solves are known. */
    pending: me.isPending || (signedIn && query.isPending),
    solves: query.data?.items ?? [],
    solved,
  };
}

/** One page of the leaderboard; the previous page stays on screen while the next loads. */
export function useLeaderboard(sort: LeaderboardSort, offset: number) {
  return useQuery({
    queryKey: queryKeys.leaderboard(sort, offset),
    queryFn: ({ signal }) => getLeaderboard(sort, offset, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: retryUnlessRefused,
  });
}

/** The signed-in user's own rank in `sort`. */
export function useLeaderboardRank(sort: LeaderboardSort, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.leaderboardRank(sort),
    queryFn: ({ signal }) => getLeaderboardRank(sort, { signal }),
    enabled,
    staleTime: 30_000,
    retry: retryUnlessRefused,
  });
}

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: queryKeys.profile(username),
    queryFn: ({ signal }) => getProfile(username, { signal }),
    staleTime: 30_000,
    retry: retryUnlessRefused,
  });
}

/** Paper titles by id, for naming papers outside the catalogue. */
export function usePaperTitles() {
  const query = useQuery({
    queryKey: queryKeys.paperTitles,
    queryFn: ({ signal }) => getPaperTitles({ signal }),
    staleTime: 5 * 60_000,
    retry: retryUnlessRefused,
  });
  return useMemo(
    () => new Map((query.data?.items ?? []).map((paper) => [paper.id, paper.title])),
    [query.data],
  );
}

/** Quiz topics (`GET /v1/exams/topics`), public. */
export function useExamTopics() {
  return useQuery({
    queryKey: queryKeys.examTopics,
    queryFn: ({ signal }) => getExamTopics({ signal }),
    staleTime: 60_000,
    retry: retryUnlessRefused,
  });
}

/** The signed-in user's quiz attempts, newest first, a page at a time. */
export function useExamAttempts(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.examAttempts,
    queryFn: ({ pageParam, signal }) => getExamAttempts(pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
    retry: retryUnlessRefused,
  });
}

/** Approved reviews, newest first, a page at a time. */
export function useReviews() {
  return useInfiniteQuery({
    queryKey: queryKeys.reviews,
    queryFn: ({ pageParam, signal }) => getReviews(pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 60_000,
    retry: retryUnlessRefused,
  });
}

/** The signed-in user's own reviews and bug reports. */
export function useMyFeedback(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.myFeedback,
    queryFn: ({ pageParam, signal }) => getMyFeedback(pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
    retry: retryUnlessRefused,
  });
}

/** The signed-in user's progress through a course. */
export function useCourseProgress(courseId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.courseProgress(courseId),
    queryFn: ({ signal }) => getCourseProgress(courseId, { signal }),
    enabled,
    retry: retryUnlessRefused,
  });
}

/** An exercise's questions, without answers. */
export function useExercise(courseId: string, itemId: string) {
  return useQuery({
    queryKey: queryKeys.exercise(courseId, itemId),
    queryFn: ({ signal }) => getExercise(courseId, itemId, { signal }),
    staleTime: 5 * 60_000,
    retry: retryUnlessRefused,
  });
}

/** The signed-in user's note on one course item. */
export function useNote(courseId: string, itemId: string) {
  return useQuery({
    queryKey: queryKeys.note(courseId, itemId),
    queryFn: ({ signal }) => getNote(courseId, itemId, { signal }),
    retry: retryUnlessRefused,
  });
}

/**
 * A lecture's short-lived video URL. Never reused from cache: the player
 * refetches it before it expires, and `dataUpdatedAt` says when it was issued.
 */
export function usePlayback(courseId: string, itemId: string) {
  return useQuery({
    queryKey: queryKeys.playback(courseId, itemId),
    queryFn: ({ signal }) => getPlayback(courseId, itemId, { signal }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: retryUnlessRefused,
  });
}

/** The signed-in user's CVs. */
export function useCvs() {
  return useQuery({
    queryKey: queryKeys.cvs,
    queryFn: ({ signal }) => getCvs({ signal }),
    retry: retryUnlessRefused,
  });
}

/** One draft, polled while it is being written. */
export function useColdMail(id: string, pollMs: number) {
  return useQuery({
    queryKey: queryKeys.coldMail(id),
    queryFn: ({ signal }) => getColdMail(id, { signal }),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? pollMs : false),
    retry: retryUnlessRefused,
  });
}

/** The signed-in user's drafts, newest first, a page at a time. */
export function useColdMails() {
  return useInfiniteQuery({
    queryKey: queryKeys.coldMails,
    queryFn: ({ pageParam, signal }) => getColdMails(pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: retryUnlessRefused,
  });
}
