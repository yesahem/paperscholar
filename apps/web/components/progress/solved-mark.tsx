"use client";

import { Badge } from "@repo/ui/components/badge";
import { CircleCheck } from "lucide-react";
import { useProgress } from "@/lib/queries";
import { solveKey } from "@/lib/progress/solved";

export interface SolvedMarkProps {
  paperId: string;
  problemId: string;
  /** `icon` beside a list row; `badge` beside a heading. */
  variant?: "icon" | "badge";
}

/**
 * Shows that the signed-in user has solved a problem. Renders nothing for
 * visitors and for unsolved problems; the content around it is cached for
 * everyone, so this is filled in by the browser (docs/specs/08-web.md §1).
 */
export function SolvedMark({ paperId, problemId, variant = "icon" }: SolvedMarkProps) {
  const { solved } = useProgress();
  if (!solved.has(solveKey(paperId, problemId))) return null;
  if (variant === "badge") {
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden="true" />
        Solved
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center text-success" title="Solved">
      <CircleCheck aria-hidden="true" className="size-5" />
      <span className="sr-only">Solved</span>
    </span>
  );
}
