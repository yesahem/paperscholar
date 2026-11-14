"use client";

import type { InstanceConfig, Me } from "@repo/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { hasSession } from "@/lib/auth/auth-api";
import { instanceConfigSchema, meSchema } from "@/lib/auth/schemas";

/** TanStack Query hooks, one per endpoint (docs/specs/08-web.md §3). */

export const queryKeys = {
  config: ["config"] as const,
  me: ["me"] as const,
  problemSubmissions: (paperId: string, problemId: string) =>
    ["submissions", paperId, problemId] as const,
};

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
