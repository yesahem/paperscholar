"use client";

import type { LeaderboardSort } from "@repo/shared/progress";
import { sessionQueryKeys, useMe } from "@repo/web-core/queries/session";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
