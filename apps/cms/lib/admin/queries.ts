"use client";

import type { IngestionDetail, IngestionStatus } from "@repo/shared";
import { useQuery } from "@tanstack/react-query";
import { getDashboard, getLatestEval, getTracks } from "@/lib/api/cms";
import {
  getIngestion,
  getStep,
  listAdminPapers,
  listIngestions,
  listUsers,
} from "@/lib/api/admin";

/** Query hooks of the maintainer screens; kept apart so learner pages never load them. */

export const adminKeys = {
  papers: ["admin", "papers"] as const,
  ingestions: ["admin", "ingestions"] as const,
  ingestion: (id: string) => ["admin", "ingestion", id] as const,
  step: (id: string, stepId: string) =>
    ["admin", "ingestion", id, "step", stepId] as const,
  users: (query: string) => ["admin", "users", query] as const,
  dashboard: (days: number) => ["admin", "dashboard", days] as const,
  tracks: ["admin", "tracks"] as const,
  eval: ["admin", "eval"] as const,
};

/** States in which the pipeline is still working, so progress is polled. */
const WORKING: ReadonlySet<IngestionStatus> = new Set([
  "queued",
  "reading",
  "planning",
  "writing",
]);
/** How often progress is read while the pipeline works (docs/specs/09-paper-pipeline.md §16). */
export const PROGRESS_POLL_MS = 3_000;

/** Whether any step is still being written or verified. */
export function stepsInFlight(detail: IngestionDetail): boolean {
  return detail.stepStates.some((step) =>
    ["pending", "writing", "verifying"].includes(step.status),
  );
}

export function useAdminPapers() {
  return useQuery({
    queryKey: adminKeys.papers,
    queryFn: ({ signal }) => listAdminPapers({ signal }),
  });
}

export function useIngestions() {
  return useQuery({
    queryKey: adminKeys.ingestions,
    queryFn: ({ signal }) => listIngestions({ signal }),
    refetchInterval: (query) =>
      query.state.data?.ingestions.some((ingestion) => WORKING.has(ingestion.status))
        ? PROGRESS_POLL_MS
        : false,
  });
}

/** One ingestion, polled while the pipeline works on it or on any of its steps. */
export function useIngestion(id: string) {
  return useQuery({
    queryKey: adminKeys.ingestion(id),
    queryFn: ({ signal }) => getIngestion(id, { signal }),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return WORKING.has(data.status) || data.busy || stepsInFlight(data)
        ? PROGRESS_POLL_MS
        : false;
    },
  });
}

export function useStepFiles(id: string, stepId: string | null) {
  return useQuery({
    queryKey: adminKeys.step(id, stepId ?? ""),
    queryFn: ({ signal }) => getStep(id, stepId ?? "", { signal }),
    enabled: stepId !== null,
  });
}

export function useAdminUsers(query: string) {
  return useQuery({
    queryKey: adminKeys.users(query),
    queryFn: ({ signal }) => listUsers(query, { signal }),
  });
}

/** How often the dashboard is read while something is in flight, and otherwise. */
export const DASHBOARD_BUSY_POLL_MS = 15_000;
export const DASHBOARD_IDLE_POLL_MS = 60_000;

export function useDashboard(days: number) {
  return useQuery({
    queryKey: adminKeys.dashboard(days),
    queryFn: ({ signal }) => getDashboard(days, { signal }),
    refetchInterval: (query) =>
      (query.state.data?.inFlight.length ?? 0) > 0
        ? DASHBOARD_BUSY_POLL_MS
        : DASHBOARD_IDLE_POLL_MS,
  });
}

export function useAdminTracks() {
  return useQuery({
    queryKey: adminKeys.tracks,
    queryFn: ({ signal }) => getTracks({ signal }),
  });
}

/** The latest eval, read every few seconds until every paper has stopped. */
export function useLatestEval() {
  return useQuery({
    queryKey: adminKeys.eval,
    queryFn: ({ signal }) => getLatestEval({ signal }),
    refetchInterval: (query) =>
      query.state.data?.run && !query.state.data.run.finished ? PROGRESS_POLL_MS : false,
  });
}
