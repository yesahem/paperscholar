"use client";

import { Meter } from "@repo/ui/components/meter";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/cn";
import { useProgress } from "@/lib/queries";
import { solvedInPaper } from "@/lib/progress/solved";

export interface PaperProgressProps {
  paperId: string;
  problemCount: number;
  className?: string;
}

/** "2 of 5 solved" with a bar, for signed-in users only (docs/specs/08-web.md §6). */
export function PaperProgress({ paperId, problemCount, className }: PaperProgressProps) {
  const { signedIn, pending, solves } = useProgress();
  if (!signedIn || problemCount === 0) return null;
  if (pending) return <Skeleton className={cn("h-6 w-full", className)} />;
  const solved = solvedInPaper(solves, paperId, problemCount);
  const done = solved === problemCount;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs text-muted-foreground">
        {done ? "All solved" : `${solved} of ${problemCount} solved`}
      </span>
      <Meter
        value={solved}
        max={problemCount}
        label="Problems solved"
        tone={done ? "success" : "primary"}
      />
    </div>
  );
}
