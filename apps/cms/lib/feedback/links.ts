import type { AdminFeedbackItem } from "@repo/shared";

/** Where a bug report's step can be seen: its review screen here, and the learner's page. */
export interface ReportLinks {
  /** The step on the ingestion's review screen, for pipeline papers. */
  review: string | null;
  /** The step as learners see it. */
  step: string | null;
}

export function reportLinks(
  item: Pick<AdminFeedbackItem, "paperId" | "problemId" | "ingestionId">,
  siteUrl: string,
): ReportLinks {
  if (!item.paperId || !item.problemId) return { review: null, step: null };
  const paperId = encodeURIComponent(item.paperId);
  const problemId = encodeURIComponent(item.problemId);
  return {
    review: item.ingestionId
      ? `/ingestions/${encodeURIComponent(item.ingestionId)}/review?step=${problemId}`
      : null,
    step: `${siteUrl.replace(/\/$/, "")}/papers/${paperId}/problems/${problemId}`,
  };
}
