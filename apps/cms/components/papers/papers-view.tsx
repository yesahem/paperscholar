"use client";

import type { AdminPaper, IngestionSummary } from "@repo/shared";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useToast } from "@repo/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, FileUp, RotateCcw } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import { adminKeys, useAdminPapers, useIngestions } from "@/lib/admin/queries";
import { INGESTION_STATUS_LABEL, ingestionTone } from "@/lib/admin/format";
import { setPaperStatus } from "@/lib/api/admin";
import { ApiError } from "@repo/web-core/api/errors";
import { useInstanceConfig } from "@repo/web-core/queries/session";

const dateOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

/** `/papers`: published papers, drafts, and ingestions in progress (spec 09 §17). */
export function PapersView() {
  const config = useInstanceConfig();
  const papers = useAdminPapers();
  const ingestions = useIngestions();
  const pipeline = config.data?.features.pipeline === true;
  const inProgress = (ingestions.data?.ingestions ?? []).filter(
    (ingestion) => !["published", "ready_for_review"].includes(ingestion.status),
  );

  return (
    <div className="grid min-w-0 gap-10">
      <div className="flex flex-wrap items-center gap-3">
        {pipeline ? (
          <Link href="/papers/new" className={buttonVariants()}>
            <FileUp aria-hidden="true" />
            Upload a paper
          </Link>
        ) : config.data ? (
          <p className="text-sm text-muted-foreground">
            The paper pipeline is off on this instance: set ANTHROPIC_API_KEY for the
            backend to turn it on.
          </p>
        ) : null}
      </div>

      {pipeline ? (
        <section aria-labelledby="in-progress" className="grid min-w-0 gap-3">
          <h2 id="in-progress" className="text-xl font-semibold">
            In progress
          </h2>
          {ingestions.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : ingestions.isError ? (
            <LoadError
              what="the ingestions"
              message={ingestions.error.message}
              onRetry={() => void ingestions.refetch()}
              retrying={ingestions.isFetching}
            />
          ) : inProgress.length === 0 ? (
            <EmptyState title="Nothing is being ingested">
              Uploaded papers appear here while the pipeline reads, plans and writes them.
            </EmptyState>
          ) : (
            <ul className="grid gap-2">
              {inProgress.map((ingestion) => (
                <IngestionRow key={ingestion.id} ingestion={ingestion} />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="papers" className="grid min-w-0 gap-3">
        <h2 id="papers" className="text-xl font-semibold">
          Papers and drafts
        </h2>
        {papers.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : papers.isError ? (
          <LoadError
            what="the papers"
            message={papers.error.message}
            onRetry={() => void papers.refetch()}
            retrying={papers.isFetching}
          />
        ) : papers.data.papers.length === 0 ? (
          <EmptyState title="No papers yet">
            Papers synced from the repository and drafts made by the pipeline are listed
            here.
          </EmptyState>
        ) : (
          <div className="relative min-w-0 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Every paper on this instance, drafts included
              </caption>
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Paper
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Source
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Steps
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Published
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {papers.data.papers.map((paper) => (
                  <PaperRow key={paper.id} paper={paper} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function IngestionRow({ ingestion }: { ingestion: IngestionSummary }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <Link
        href={`/ingestions/${ingestion.id}`}
        className="min-w-0 flex-1 font-medium hover:underline"
      >
        {ingestion.title ?? `Ingestion of ${dateOf(ingestion.createdAt)}`}
      </Link>
      <Badge variant={ingestionTone(ingestion.status)}>
        {INGESTION_STATUS_LABEL[ingestion.status]}
      </Badge>
      {ingestion.steps.total > 0 ? (
        <span className="text-xs text-muted-foreground">
          {ingestion.steps.verified} of {ingestion.steps.total} steps verified
        </span>
      ) : null}
      {ingestion.error ? (
        <p className="w-full text-xs text-destructive">{ingestion.error}</p>
      ) : null}
    </li>
  );
}

function PaperRow({ paper }: { paper: AdminPaper }) {
  const queries = useQueryClient();
  const toast = useToast();
  const change = useMutation({
    mutationFn: (action: "publish" | "archive") => setPaperStatus(paper.id, action),
    onSuccess: (updated) => {
      void queries.invalidateQueries({ queryKey: adminKeys.papers });
      toast({
        title: updated.status === "archived" ? "Paper archived" : "Paper published again",
        variant: "success",
      });
    },
    onError: (error) =>
      toast({
        title: error instanceof ApiError ? error.message : "Could not change the paper",
        variant: "destructive",
      }),
  });
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">
        {paper.ingestionId ? (
          <Link
            href={`/ingestions/${paper.ingestionId}/review`}
            className="font-medium hover:underline"
          >
            {paper.title}
          </Link>
        ) : (
          <span className="font-medium">{paper.title}</span>
        )}
        <div className="font-mono text-xs text-muted-foreground">{paper.id}</div>
      </td>
      <td className="px-3 py-2">
        <Badge
          variant={
            paper.status === "published"
              ? "success"
              : paper.status === "draft"
                ? "warning"
                : "secondary"
          }
        >
          {paper.status === "draft"
            ? "Draft"
            : paper.status === "published"
              ? `Published v${paper.version}`
              : "Archived"}
        </Badge>
      </td>
      <td className="px-3 py-2 capitalize">{paper.source}</td>
      <td className="px-3 py-2 tabular-nums">{paper.problemCount}</td>
      <td className="px-3 py-2">{dateOf(paper.publishedAt)}</td>
      <td className="px-3 py-2 text-right">
        {paper.status === "published" ? (
          <Button
            size="sm"
            variant="ghost"
            loading={change.isPending}
            onClick={() => change.mutate("archive")}
          >
            <Archive aria-hidden="true" />
            Archive
          </Button>
        ) : paper.status === "archived" ? (
          <Button
            size="sm"
            variant="ghost"
            loading={change.isPending}
            onClick={() => change.mutate("publish")}
          >
            <RotateCcw aria-hidden="true" />
            Publish again
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
