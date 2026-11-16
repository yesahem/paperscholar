"use client";

import type { EvalRun } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Dialog } from "@repo/ui/components/dialog";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useToast } from "@repo/ui/components/toast";
import { ApiError } from "@repo/web-core/api/errors";
import { LoadError } from "@repo/web-core/states/load-error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  formatDateTime,
  formatTokens,
  INGESTION_STATUS_LABEL,
  ingestionTone,
  percent,
} from "@/lib/admin/format";
import { adminKeys, useLatestEval } from "@/lib/admin/queries";
import { startEval } from "@/lib/api/cms";

/** `/eval`: the quality eval of spec 09 §18, started and read from the browser (docs/specs/14-cms.md §8.3). */
export function EvalView() {
  const latest = useLatestEval();
  const [asking, setAsking] = useState(false);

  if (latest.isPending) return <Skeleton className="h-64 w-full" />;
  if (latest.isError) {
    return (
      <LoadError
        what="the eval"
        message={latest.error.message}
        onRetry={() => void latest.refetch()}
        retrying={latest.isFetching}
      />
    );
  }
  const run = latest.data.run;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          The pipeline is run on the reference papers and measured on the same scale every
          time, so a change to the prompts, the model or the checks can be judged. It
          spends real model credit.
        </p>
        <Button onClick={() => setAsking(true)} disabled={run !== null && !run.finished}>
          <FlaskConical aria-hidden="true" />
          Run the eval
        </Button>
      </div>
      {run ? <Run run={run} /> : <NoRun />}
      <StartDialog
        open={asking}
        onOpenChange={setAsking}
        papers={run?.papers.length ?? null}
      />
    </div>
  );
}

function NoRun() {
  return (
    <Alert variant="info" title="No eval has been run on this instance">
      Run it before you open uploads to the public, and record the result as the baseline.
    </Alert>
  );
}

function StartDialog({
  open,
  onOpenChange,
  papers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  papers: number | null;
}) {
  const queries = useQueryClient();
  const toast = useToast();
  const [understood, setUnderstood] = useState(false);
  const [fresh, setFresh] = useState(false);
  const start = useMutation({
    mutationFn: () => startEval({ fresh, confirmCost: true }),
    onSuccess: (run) => {
      queries.setQueryData(adminKeys.eval, { run });
      onOpenChange(false);
      setUnderstood(false);
      toast({ title: "The eval has started", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: error instanceof ApiError ? error.message : "Could not start the eval",
        variant: "destructive",
      }),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Run the eval?"
      description={`This reads, plans and writes every step of ${papers === null ? "the reference papers" : `${papers} reference papers`} from arXiv, and verifies them in the sandbox. It can take many minutes and spends real model credit.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => start.mutate()}
            loading={start.isPending}
            disabled={!understood}
          >
            Start the eval
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Checkbox
          id="eval-fresh"
          checked={fresh}
          onChange={(event) => setFresh(event.target.checked)}
          label="Start unpublished reference papers again"
          description="Otherwise a paper already ingested is measured as it stands."
        />
        <Checkbox
          id="eval-cost"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
          label="I understand this spends model credit"
        />
      </div>
    </Dialog>
  );
}

function Run({ run }: { run: EvalRun }) {
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="eval-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="eval-heading" className="text-lg font-semibold">
          Latest run
        </h2>
        {run.finished ? (
          <Badge variant="success">Finished</Badge>
        ) : (
          <Badge variant="warning">Running</Badge>
        )}
        <span className="text-sm text-muted-foreground">
          Started {formatDateTime(run.startedAt)} · {run.model} · prompts{" "}
          {run.promptVersion}
          {run.fresh ? " · fresh" : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-3xl text-sm">
          <caption className="sr-only">Measures per reference paper</caption>
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Paper
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                State
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Steps
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                First-pass verified
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Needs attention
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Mutants killed
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Solved unseen
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Output / step
              </th>
            </tr>
          </thead>
          <tbody>
            {run.papers.map((paper) => (
              <tr key={paper.name} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  {paper.ingestionId ? (
                    <Link
                      href={`/ingestions/${paper.ingestionId}`}
                      className="font-medium hover:underline"
                    >
                      {paper.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{paper.name}</span>
                  )}
                  <div className="font-mono text-xs text-muted-foreground">
                    {paper.source}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {paper.status ? (
                    <Badge variant={ingestionTone(paper.status)}>
                      {INGESTION_STATUS_LABEL[paper.status]}
                    </Badge>
                  ) : (
                    <span className="text-destructive">
                      {paper.error ?? "Not started"}
                    </span>
                  )}
                </td>
                <Cells measures={paper.measures} />
              </tr>
            ))}
          </tbody>
          {run.summary ? (
            <tfoot>
              <tr className="border-t border-border bg-muted/50 font-medium">
                <th scope="row" className="px-3 py-2 text-left" colSpan={2}>
                  All {run.summary.papers} papers
                </th>
                <Cells measures={run.summary} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Figures are measured from the ingestions as they stand now. Rates are shares of
        steps; “mutants killed” and “solved unseen” are the first attempt of each step.
      </p>
    </section>
  );
}

interface CellMeasures {
  steps: number;
  firstAttemptVerificationRate: number | null;
  needsAttentionRate: number | null;
  mutationKillRate: number | null;
  independentSolveRate: number | null;
  outputTokensPerStep: number | null;
}

function Cells({ measures }: { measures: CellMeasures | null }) {
  const dash = <span className="text-muted-foreground">—</span>;
  if (measures === null) {
    return (
      <>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <td key={index} className="px-3 py-2 text-right">
            {dash}
          </td>
        ))}
      </>
    );
  }
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{measures.steps}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {percent(measures.firstAttemptVerificationRate)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {percent(measures.needsAttentionRate)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {percent(measures.mutationKillRate)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {percent(measures.independentSolveRate)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {measures.outputTokensPerStep === null
          ? "—"
          : formatTokens(Math.round(measures.outputTokensPerStep))}
      </td>
    </>
  );
}
