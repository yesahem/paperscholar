import type { PaperSummary, Track } from "@repo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ContentUnavailable } from "@/components/content/content-unavailable";
import { DifficultyMix } from "@/components/content/difficulty-badge";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { PaperProgress } from "@/components/progress/paper-progress";
import {
  getPapers,
  getTracks,
  loadAtBuild,
  UNAVAILABLE_AT_BUILD,
} from "@/lib/api/content";
import { formatAuthors, pluralise } from "@/lib/content/format";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Roadmap",
  description: "Learning tracks: papers in the order that builds each idea on the last.",
  alternates: { canonical: "/roadmap" },
};

function TrackSection({
  track,
  papers,
}: {
  track: Track;
  papers: Map<string, PaperSummary>;
}) {
  const trackPapers = track.paperIds.flatMap((id) => {
    const paper = papers.get(id);
    return paper ? [paper] : [];
  });
  const problemCount = trackPapers.reduce((sum, paper) => sum + paper.problemCount, 0);
  return (
    <section aria-labelledby={`track-${track.id}`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`track-${track.id}`} className="text-xl font-semibold">
          {track.title}
        </h2>
        <p className="text-muted-foreground">{track.summary}</p>
        <p className="text-sm text-muted-foreground">
          {pluralise(trackPapers.length, "paper")} · {pluralise(problemCount, "problem")}
        </p>
      </div>
      <ol className="relative flex flex-col gap-3 border-l border-border pl-6">
        {trackPapers.map((paper, index) => (
          <li key={paper.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute top-4 -left-[2.15rem] flex size-5 items-center justify-center rounded-full border border-border bg-background font-mono text-[0.65rem] text-muted-foreground"
            >
              {index + 1}
            </span>
            <Link
              href={`/papers/${paper.id}`}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="font-medium">{paper.title}</span>
              <span className="text-sm text-muted-foreground">
                {formatAuthors(paper.authors)}
                {paper.year ? ` · ${paper.year}` : null}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {pluralise(paper.problemCount, "problem")}
                <DifficultyMix counts={paper.difficultyCounts} />
              </span>
              <PaperProgress
                paperId={paper.id}
                problemCount={paper.problemCount}
                className="mt-2 max-w-sm"
              />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function RoadmapPage() {
  const content = await loadAtBuild(() => Promise.all([getTracks(), getPapers()]));

  return (
    <PageContainer>
      <PageHeader
        title="Roadmap"
        description="Tracks put papers in an order where each one builds on what came before. Follow one from the top."
      />
      {content === UNAVAILABLE_AT_BUILD ? (
        <ContentUnavailable what="roadmap" />
      ) : content[0].length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">No tracks are published on this instance yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tracks appear here once papers they list are published.{" "}
            <Link href="/papers" className="underline underline-offset-4">
              Browse every paper
            </Link>{" "}
            in the meantime.
          </p>
        </div>
      ) : (
        content[0].map((track) => (
          <TrackSection
            key={track.id}
            track={track}
            papers={new Map(content[1].map((paper) => [paper.id, paper]))}
          />
        ))
      )}
    </PageContainer>
  );
}
