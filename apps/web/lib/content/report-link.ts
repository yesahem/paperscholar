import { SITE } from "@repo/shared/site";

/**
 * A prefilled issue on the project's tracker for a problem with a step, so a
 * wrong test or an unclear description reaches a maintainer
 * (docs/specs/08-web.md §5.6). In-app reports replace this in M7.
 */
export function problemReportUrl({
  paperId,
  problemId,
  title,
  pageUrl,
}: {
  paperId: string;
  problemId: string;
  title: string;
  pageUrl: string;
}): string {
  const params = new URLSearchParams({
    title: `Problem with step: ${title} (${paperId}/${problemId})`,
    body: [
      `Step: ${pageUrl}`,
      "",
      "What is wrong? (an unclear description, a test that seems wrong, a typo…)",
      "",
    ].join("\n"),
    labels: "content",
  });
  return `${SITE.repositoryUrl}/issues/new?${params.toString()}`;
}
