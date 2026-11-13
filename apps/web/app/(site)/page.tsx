import { SITE, type PaperDetail, type ProblemDetail } from "@repo/shared";
import { buttonVariants } from "@repo/ui/components/button";
import { ArrowRight, BookOpen, Code2, Map as MapIcon, Server } from "lucide-react";
import Link from "next/link";
import { DifficultyBadge } from "@/components/content/difficulty-badge";
import { Markdown } from "@/components/content/markdown";
import { PaperGrid } from "@/components/content/paper-card";
import {
  getPaper,
  getPapers,
  getProblem,
  getTracks,
  loadAtBuild,
  UNAVAILABLE_AT_BUILD,
} from "@/lib/api/content";
import { samplePaperId } from "@/lib/content/sample-problem";

export const revalidate = 30;

const STEPS = [
  {
    Icon: MapIcon,
    title: "Pick a paper",
    text: "Each paper is split into small steps that build on each other, from one equation to the whole method.",
  },
  {
    Icon: BookOpen,
    title: "Read the step",
    text: "A short description says what to implement and points at the part of the paper it comes from.",
  },
  {
    Icon: Code2,
    title: "Write the code",
    text: "Implement it in Python in the browser editor. Your draft is kept in this browser while you work.",
  },
] as const;

async function loadLanding() {
  const [papers, tracks] = await Promise.all([getPapers(), getTracks()]);
  const paperId = samplePaperId(tracks, papers);
  let sample: { paper: PaperDetail; problem: ProblemDetail } | null = null;
  if (paperId) {
    const paper = await getPaper(paperId);
    const first = paper?.problems[0];
    const problem = paper && first ? await getProblem(paper.id, first.id) : null;
    if (paper && problem) sample = { paper, problem };
  }
  return { papers, sample };
}

export default async function HomePage() {
  const content = await loadAtBuild(loadLanding);
  const papers = content === UNAVAILABLE_AT_BUILD ? [] : content.papers;
  const sample = content === UNAVAILABLE_AT_BUILD ? null : content.sample;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 py-14 sm:px-6 sm:py-20">
      <section className="flex flex-col items-start gap-6">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {SITE.tagline}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          Reading a paper tells you what it says. Implementing it shows you how it works.{" "}
          {SITE.name} breaks landmark papers into small coding steps you solve in the
          browser. Free, and open source.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/papers" className={buttonVariants({ size: "lg" })}>
            Browse papers
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href="/roadmap"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            See the roadmap
          </Link>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ Icon, title, text }, index) => (
            <li
              key={title}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
            >
              <span className="flex items-center gap-3">
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <span className="font-medium">
                  <span className="sr-only">Step {index + 1}: </span>
                  {title}
                </span>
              </span>
              <p className="text-sm text-pretty text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          Running your code against each step&apos;s tests comes with the next release.
        </p>
      </section>

      {sample ? (
        <section
          aria-labelledby="sample-heading"
          className="grid items-start gap-8 lg:grid-cols-2"
        >
          <div className="flex flex-col gap-4">
            <h2 id="sample-heading" className="text-2xl font-semibold tracking-tight">
              A first step
            </h2>
            <p className="text-sm text-muted-foreground">
              From{" "}
              <Link
                href={`/papers/${sample.paper.id}`}
                className="underline underline-offset-4"
              >
                {sample.paper.title}
              </Link>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-medium">{sample.problem.title}</h3>
              <DifficultyBadge difficulty={sample.problem.difficulty} />
            </div>
            <p className="text-pretty text-muted-foreground">{sample.problem.summary}</p>
            <div>
              <Link
                href={`/papers/${sample.paper.id}/problems/${sample.problem.id}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Try it
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
          <Markdown className="min-w-0">{`\`\`\`python\n${sample.problem.starter.trimEnd()}\n\`\`\``}</Markdown>
        </section>
      ) : null}

      {papers.length > 0 ? (
        <section aria-labelledby="papers-heading" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="papers-heading" className="text-2xl font-semibold tracking-tight">
              Papers
            </h2>
            <Link href="/papers" className={buttonVariants({ variant: "link" })}>
              All papers
            </Link>
          </div>
          <PaperGrid papers={papers.slice(0, 3)} />
        </section>
      ) : null}

      <section
        aria-labelledby="open-heading"
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-4">
          <Server aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
          <div className="flex flex-col gap-1">
            <h2 id="open-heading" className="font-semibold">
              Free to use, free to host
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              Every paper and every feature is free. Run your own instance for a class or
              a team, or add a paper to the shared library.
            </p>
          </div>
        </div>
        <a
          href={SITE.repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          View on GitHub
        </a>
      </section>
    </div>
  );
}
