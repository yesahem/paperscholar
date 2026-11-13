import type { Metadata } from "next";
import { Suspense } from "react";
import { ContentUnavailable } from "@/components/content/content-unavailable";
import { PaperCatalogue } from "@/components/content/paper-catalogue";
import { PaperGrid } from "@/components/content/paper-card";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { getPapers, loadAtBuild, UNAVAILABLE_AT_BUILD } from "@/lib/api/content";

export const revalidate = 30;

// No loading.tsx for content pages: a loading boundary streams the real content
// in a hidden chunk that only JavaScript reveals, and turns 404s into 200s.

export const metadata: Metadata = {
  title: "Papers",
  description:
    "Machine-learning papers to implement step by step, each with tested problems.",
  alternates: { canonical: "/papers" },
};

export default async function PapersPage() {
  const papers = await loadAtBuild(getPapers);

  return (
    <PageContainer>
      <PageHeader
        title="Papers"
        description="Pick a paper and implement it one step at a time. Every step is a small, tested function."
      />
      {papers === UNAVAILABLE_AT_BUILD ? (
        <ContentUnavailable what="catalogue" />
      ) : papers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">No papers are published on this instance yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A maintainer publishes papers with{" "}
            <code className="font-mono">bun run content:sync</code>.
          </p>
        </div>
      ) : (
        // Without JavaScript, or before the filters load, the full list shows.
        <Suspense fallback={<PaperGrid papers={papers} />}>
          <PaperCatalogue papers={papers} />
        </Suspense>
      )}
    </PageContainer>
  );
}
