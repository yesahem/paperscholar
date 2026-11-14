"use client";

import { buttonVariants } from "@repo/ui/components/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useProgress } from "@/lib/queries";
import { continueTarget } from "@/lib/progress/solved";

export interface ContinueButtonProps {
  paperId: string;
  problems: { id: string; order: number }[];
}

/**
 * The paper page's main button: "Start" at step one, or "Continue" at the
 * first unsolved step (docs/specs/08-web.md §6). The server renders "Start";
 * the browser updates it once the user's solves are known.
 */
export function ContinueButton({ paperId, problems }: ContinueButtonProps) {
  const { solved } = useProgress();
  const target = continueTarget(paperId, problems, solved);
  if (!target) return null;
  const label =
    target.kind === "start"
      ? "Start with step 1"
      : target.kind === "continue"
        ? `Continue with step ${target.order}`
        : "Review from step 1";
  return (
    <Link
      href={`/papers/${paperId}/problems/${target.problemId}`}
      className={buttonVariants({ size: "lg" })}
    >
      {label}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}
