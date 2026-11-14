import type { PaperSummary } from "@repo/shared";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import Link from "next/link";
import { formatAuthors, formatTag, pluralise } from "@/lib/content/format";
import { PaperProgress } from "@/components/progress/paper-progress";
import { DifficultyMix } from "./difficulty-badge";

/** A paper in the catalogue. The whole card is one link to the paper. */
export function PaperCard({ paper }: { paper: PaperSummary }) {
  return (
    <Card className="relative w-full transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring hover:border-ring">
      <CardHeader>
        <CardTitle className="text-lg">
          <Link
            href={`/papers/${paper.id}`}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
          >
            {paper.title}
          </Link>
        </CardTitle>
        <CardDescription>
          {formatAuthors(paper.authors)}
          {paper.year ? ` · ${paper.year}` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="text-sm text-pretty text-muted-foreground">{paper.summary}</p>
        <div className="mt-auto flex flex-col gap-3">
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
            {paper.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">{formatTag(tag)}</Badge>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              {pluralise(paper.problemCount, "problem")}
            </span>
            <DifficultyMix counts={paper.difficultyCounts} />
          </div>
          <PaperProgress paperId={paper.id} problemCount={paper.problemCount} />
        </div>
      </CardContent>
    </Card>
  );
}

export function PaperGrid({ papers }: { papers: PaperSummary[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {papers.map((paper) => (
        <li key={paper.id} className="flex">
          <PaperCard paper={paper} />
        </li>
      ))}
    </ul>
  );
}
