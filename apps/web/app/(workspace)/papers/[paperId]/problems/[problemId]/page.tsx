import { buttonVariants } from "@repo/ui/components/button";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DifficultyBadge } from "@/components/content/difficulty-badge";
import { Markdown } from "@/components/content/markdown";
import { SolvedMark } from "@/components/progress/solved-mark";
import { LimitsBox } from "@/components/workspace/limits-box";
import { ReportStep } from "@/components/workspace/report-step";
import { Workspace } from "@/components/workspace/workspace";
import { getPaper, getProblem } from "@/lib/api/content";

export const revalidate = 30;

/**
 * Rendered on first request, then cached and refreshed (docs/specs/08-web.md §1).
 * This route has no loading.tsx on purpose: a loading boundary starts streaming
 * before the page runs, so an unknown id would answer 200 instead of 404.
 */
export function generateStaticParams(): { paperId: string; problemId: string }[] {
  return [];
}

interface ProblemPageProps {
  params: Promise<{ paperId: string; problemId: string }>;
}

export async function generateMetadata({ params }: ProblemPageProps): Promise<Metadata> {
  const { paperId, problemId } = await params;
  const [paper, problem] = await Promise.all([
    getPaper(paperId),
    getProblem(paperId, problemId),
  ]);
  if (!paper || !problem) return { title: "Problem not found" };
  return {
    title: `${problem.title} · ${paper.title}`,
    description: `Step ${problem.order} of ${paper.title}: ${problem.summary}`,
    alternates: { canonical: `/papers/${paperId}/problems/${problemId}` },
  };
}

export default async function ProblemPage({ params }: ProblemPageProps) {
  const { paperId, problemId } = await params;
  const [paper, problem] = await Promise.all([
    getPaper(paperId),
    getProblem(paperId, problemId),
  ]);
  if (!paper || !problem) notFound();

  const next = paper.problems.find((candidate) => candidate.order === problem.order + 1);

  const heading = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <nav
        aria-label="Breadcrumb"
        className="min-w-0 truncate text-sm text-muted-foreground"
      >
        <Link
          href={`/papers/${paper.id}`}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          {paper.title}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>
          Step {problem.order} of {paper.problemCount}
        </span>
      </nav>
      <h1 className="truncate font-semibold">{problem.title}</h1>
      <DifficultyBadge difficulty={problem.difficulty} />
      <SolvedMark paperId={paperId} problemId={problemId} variant="badge" />
    </div>
  );

  const description = (
    <>
      <Markdown>{problem.description}</Markdown>
      <LimitsBox problem={problem} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <ReportStep
          paperId={paperId}
          problemId={problemId}
          problemTitle={problem.title}
        />
        {next ? (
          <Link
            href={`/papers/${paperId}/problems/${next.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Next: {next.title}
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href={`/papers/${paperId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to {paper.title}
          </Link>
        )}
      </div>
    </>
  );

  return (
    <Workspace
      paperId={paperId}
      problemId={problemId}
      problemTitle={problem.title}
      starter={problem.starter}
      allowedPackages={problem.allowedPackages}
      timeLimitSeconds={problem.timeLimitSeconds}
      memoryLimitMb={problem.memoryLimitMb}
      next={
        next
          ? { href: `/papers/${paperId}/problems/${next.id}`, title: next.title }
          : null
      }
      heading={heading}
      description={description}
      tutorial={problem.tutorial ? <Markdown>{problem.tutorial}</Markdown> : null}
    />
  );
}
