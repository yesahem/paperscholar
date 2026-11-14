import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProblemList } from "@/components/content/problem-list";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { ContinueButton } from "@/components/progress/continue-button";
import { PaperProgress } from "@/components/progress/paper-progress";
import { getPaper } from "@/lib/api/content";
import { formatAuthors, formatTag, pluralise } from "@/lib/content/format";

export const revalidate = 30;

/**
 * Rendered on first request, then cached and refreshed (docs/specs/08-web.md §1).
 * This route has no loading.tsx on purpose: a loading boundary starts streaming
 * before the page runs, so an unknown id would answer 200 instead of 404.
 */
export function generateStaticParams(): { paperId: string }[] {
  return [];
}

interface PaperPageProps {
  params: Promise<{ paperId: string }>;
}

export async function generateMetadata({ params }: PaperPageProps): Promise<Metadata> {
  const { paperId } = await params;
  const paper = await getPaper(paperId);
  if (!paper) return { title: "Paper not found" };
  return {
    title: paper.title,
    description: `Implement ${paper.title} in ${pluralise(paper.problemCount, "step")}. ${paper.summary}`,
    alternates: { canonical: `/papers/${paper.id}` },
  };
}

export default async function PaperPage({ params }: PaperPageProps) {
  const { paperId } = await params;
  const paper = await getPaper(paperId);
  if (!paper) notFound();

  return (
    <PageContainer>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link
          href="/papers"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Papers
        </Link>
      </nav>
      <PageHeader title={paper.title} description={paper.summary}>
        <p className="text-sm text-muted-foreground">
          {formatAuthors(paper.authors, 4)}
          {paper.year ? ` · ${paper.year}` : null}
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {paper.tags.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary">{formatTag(tag)}</Badge>
            </li>
          ))}
        </ul>
        <PaperProgress
          paperId={paper.id}
          problemCount={paper.problemCount}
          className="max-w-sm"
        />
        <div className="mt-2 flex flex-wrap gap-3">
          <ContinueButton
            paperId={paper.id}
            problems={paper.problems.map(({ id, order }) => ({ id, order }))}
          />
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <ExternalLink aria-hidden="true" />
            Read the paper
          </a>
        </div>
      </PageHeader>

      <section aria-labelledby="steps-heading" className="flex flex-col gap-4">
        <h2 id="steps-heading" className="text-xl font-semibold">
          {pluralise(paper.problemCount, "step")}
        </h2>
        {paper.problems.length > 0 ? (
          <ProblemList paperId={paper.id} problems={paper.problems} />
        ) : (
          <p className="text-muted-foreground">
            This paper has no published steps yet. Check back soon.
          </p>
        )}
      </section>
    </PageContainer>
  );
}
