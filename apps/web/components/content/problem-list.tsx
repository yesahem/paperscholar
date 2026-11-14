import type { ProblemSummary } from "@repo/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { SolvedMark } from "@/components/progress/solved-mark";
import { DifficultyBadge } from "./difficulty-badge";

/** A paper's problems in the order they build on each other, solved ones ticked. */
export function ProblemList({
  paperId,
  problems,
}: {
  paperId: string;
  problems: ProblemSummary[];
}) {
  return (
    <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {problems.map((problem) => (
        <li key={problem.id}>
          <Link
            href={`/papers/${paperId}/problems/${problem.id}`}
            className="group flex items-start gap-4 p-4 transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:items-center"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border font-mono text-sm text-muted-foreground"
            >
              {problem.order}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-medium">
                <span className="sr-only">Step {problem.order}: </span>
                {problem.title}
              </span>
              <span className="text-sm text-pretty text-muted-foreground">
                {problem.summary}
              </span>
            </span>
            <SolvedMark paperId={paperId} problemId={problem.id} />
            <DifficultyBadge difficulty={problem.difficulty} />
            <ChevronRight
              aria-hidden="true"
              className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
            />
          </Link>
        </li>
      ))}
    </ol>
  );
}
