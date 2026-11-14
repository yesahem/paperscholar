import type { Solve } from "@repo/shared";

/** `paperId/problemId` for every solve, for constant-time lookups. */
export function solvedKeys(solves: readonly Solve[]): Set<string> {
  return new Set(solves.map((solve) => solveKey(solve.paperId, solve.problemId)));
}

export function solveKey(paperId: string, problemId: string): string {
  return `${paperId}/${problemId}`;
}

/** How many of `problemIds` of `paperId` are solved. */
export function solvedCount(
  solved: ReadonlySet<string>,
  paperId: string,
  problemIds: readonly string[],
): number {
  return problemIds.filter((id) => solved.has(solveKey(paperId, id))).length;
}

/**
 * Solves in `paperId`, capped at its current problem count: a solve of a
 * retired step still counts for the learner but not towards this bar.
 */
export function solvedInPaper(
  solves: readonly Solve[],
  paperId: string,
  problemCount: number,
): number {
  const problems = new Set(
    solves.filter((solve) => solve.paperId === paperId).map((solve) => solve.problemId),
  );
  return Math.min(problems.size, problemCount);
}

export type ContinueTarget =
  | { kind: "start"; problemId: string }
  | { kind: "continue"; problemId: string; order: number }
  | { kind: "done"; problemId: string };

/**
 * Where the paper page's main button leads (docs/specs/08-web.md §6): the
 * first step when nothing is solved, otherwise the first unsolved step in
 * order, or back to the first step once all are solved. Null without steps.
 */
export function continueTarget(
  paperId: string,
  problems: readonly { id: string; order: number }[],
  solved: ReadonlySet<string>,
): ContinueTarget | null {
  const ordered = [...problems].sort((a, b) => a.order - b.order);
  const first = ordered[0];
  if (!first) return null;
  const unsolved = ordered.find((problem) => !solved.has(solveKey(paperId, problem.id)));
  if (!unsolved) return { kind: "done", problemId: first.id };
  if (
    solvedCount(
      solved,
      paperId,
      ordered.map((problem) => problem.id),
    ) === 0
  ) {
    return { kind: "start", problemId: first.id };
  }
  return { kind: "continue", problemId: unsolved.id, order: unsolved.order };
}
