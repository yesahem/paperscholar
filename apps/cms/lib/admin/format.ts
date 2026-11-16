import type { IngestionStatus, StepStatus } from "@repo/shared/pipeline";

/** Words for states, as a maintainer reads them. */
export const INGESTION_STATUS_LABEL: Record<IngestionStatus, string> = {
  queued: "Queued",
  reading: "Reading the paper",
  planning: "Planning the steps",
  awaiting_plan_review: "Waiting for plan review",
  writing: "Writing and verifying steps",
  ready_for_review: "Ready for review",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: "Waiting",
  writing: "Writing",
  verifying: "Verifying",
  verified: "Verified",
  needs_attention: "Needs attention",
  edited: "Edited, not verified",
};

export type Tone = "success" | "warning" | "destructive" | "secondary";

export function ingestionTone(status: IngestionStatus): Tone {
  if (status === "published" || status === "ready_for_review") return "success";
  if (status === "failed") return "destructive";
  if (status === "awaiting_plan_review" || status === "cancelled") return "warning";
  return "secondary";
}

export function stepTone(status: StepStatus): Tone {
  if (status === "verified") return "success";
  if (status === "needs_attention") return "destructive";
  if (status === "edited") return "warning";
  return "secondary";
}

/** `12 345` tokens, with a thin grouping that reads in any locale. */
export function formatTokens(value: number): string {
  return value.toLocaleString("en");
}

/** The files of a step, with the label each has on the review screen. */
export const STEP_FILE_TABS = [
  { key: "description", label: "Description", language: "markdown" },
  { key: "tutorial", label: "Tutorial", language: "markdown" },
  { key: "starter", label: "Starter", language: "python" },
  { key: "solution", label: "Solution", language: "python" },
  { key: "testsPublic", label: "Public tests", language: "python" },
  { key: "testsHidden", label: "Hidden tests", language: "python" },
  { key: "helpers", label: "Helpers", language: "python" },
] as const;
export type StepFileKey = (typeof STEP_FILE_TABS)[number]["key"];

/** `83%`, or a dash when there is nothing to measure. */
export function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** `2026-11-16T10:00:00Z` as `16 Nov 2026, 10:00`, in the reader's time zone. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
