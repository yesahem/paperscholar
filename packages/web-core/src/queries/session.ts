"use client";

import type { InstanceConfig, Me } from "@repo/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiRequest } from "../api/client";
import { ApiError } from "../api/errors";
import { hasSession } from "../auth/auth-api";
import { instanceConfigSchema, meSchema } from "../auth/schemas";

/** Query keys of the hooks below, so each app can invalidate them. */
export const sessionQueryKeys = {
  config: ["config"] as const,
  me: ["me"] as const,
};

/** What this instance offers (`GET /v1/config`). Fetched once per visit. */
export function useInstanceConfig() {
  return useQuery<InstanceConfig>({
    queryKey: sessionQueryKeys.config,
    queryFn: ({ signal }) => apiRequest("/v1/config", instanceConfigSchema, { signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The signed-in account (`GET /v1/me`), or null when signed out. This is the
 * session as the app sees it; nothing about it is kept in localStorage.
 *
 * Better Auth's session check answers 200 with null for visitors, so asking
 * it first keeps signed-out pages free of failed requests.
 */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: sessionQueryKeys.me,
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
    () => client.invalidateQueries({ queryKey: sessionQueryKeys.me }),
    [client],
  );
}
