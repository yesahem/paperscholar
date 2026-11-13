import type { PaperSummary, Track } from "@repo/shared";

/**
 * The paper whose first step the landing page shows: the start of the first
 * track, or else the first paper with any problems.
 */
export function samplePaperId(tracks: Track[], papers: PaperSummary[]): string | null {
  const withProblems = new Set(
    papers.filter((paper) => paper.problemCount > 0).map((paper) => paper.id),
  );
  for (const track of tracks) {
    const id = track.paperIds.find((paperId) => withProblems.has(paperId));
    if (id) return id;
  }
  return papers.find((paper) => withProblems.has(paper.id))?.id ?? null;
}
