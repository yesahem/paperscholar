"use client";

import type { InstanceConfig, Me } from "@repo/shared";
import type { LeaderboardSort } from "@repo/shared/progress";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { apiRequest } from "@/lib/api/client";
import { getLeaderboard, getLeaderboardRank, getProgress } from "@/lib/api/progress";
import { getPaperTitles, getProfile } from "@/lib/api/users";
import { solvedKeys } from "@/lib/progress/solved";
import { ApiError } from "@/lib/api/errors";
import { hasSession } from "@/lib/auth/auth-api";
import { instanceConfigSchema, meSchema } from "@/lib/auth/schemas";

/** TanStack Query hooks, one per endpoint (docs/specs/08-web.md §3). */

export const queryKeys = {
  config: ["config"] as const,
  me: ["me"] as const,
  problemSubmissions: (paperId: string, problemId: string) =>
    ["submissions", paperId, problemId] as const,
  progress: ["progress"] as const,
  leaderboard: (sort: LeaderboardSort, offset: number) =>
    ["leaderboard", sort, offset] as const,
  leaderboardRank: (sort: LeaderboardSort) => ["leaderboard", "me", sort] as const,
  profile: (username: string) => ["profile", username] as const,
  following: (username: string) => ["following", username] as const,
  paperTitles: ["paper-titles"] as const,
};

/** Never retry an answer the API gave on purpose (a 4xx); retry network trouble twice. */
const retryUnlessRefused = (failures: number, error: Error) =>
  !(error instanceof ApiError && error.status !== null && error.status < 500) &&
  failures < 2;

/** What this instance offers (`GET /v1/config`). Fetched once per visit. */
export function useInstanceConfig() {
  return useQuery<InstanceConfig>({
    queryKey: queryKeys.config,
    queryFn: ({ signal }) => apiRequest("/v1/config", instanceConfigSchema, { signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The signed-in account (`GET /v1/me`), or null when signed out. This is the
 * session as the web app sees it; nothing about it is kept in localStorage.
 *
 * Better Auth's session check answers 200 with null for visitors, so asking
 * it first keeps signed-out pages free of failed requests.
 */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: queryKeys.me,
    queryFn: async ({ signal }) => {
      if (!(await hasSession(signal))) return null;
      try {
        return await apiRequest("/v1/me", meSchema, { signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    // Confirming the email in another tab should show here on return.
    refetchOnWindowFocus: true,
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status !== null) && failures < 2,
  });
}

/** Re-reads the account after signing in, signing out or verifying. */
export function useRefreshMe() {
  const client = useQueryClient();
  return useCallback(
    () => client.invalidateQueries({ queryKey: queryKeys.me }),
    [client],
  );
}

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
