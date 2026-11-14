"use client";

import type { IngestionDetail } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Dialog } from "@repo/ui/components/dialog";
import { Meter } from "@repo/ui/components/meter";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useToast } from "@repo/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, RotateCcw, SquareX, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadError } from "@/components/states/load-error";
import {
  formatTokens,
  INGESTION_STATUS_LABEL,
  ingestionTone,
  STEP_STATUS_LABEL,
  stepTone,
} from "@/lib/admin/format";
import { adminKeys, useIngestion } from "@/lib/admin/queries";
import { cancelIngestion, discardIngestion, retryIngestion } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";

/** The order stages run in, for the progress line. */
const STAGES = ["queued", "reading", "planning", "writing", "ready_for_review"] as const;

/** `/admin/ingestions/[id]`: live progress, per-step status and tokens used so far (spec 09 §17). */
export function IngestionProgress({ id, existing }: { id: string; existing: boolean }) {
  const ingestion = useIngestion(id);
  if (ingestion.isPending) return <Skeleton className="h-64 w-full" />;
  if (ingestion.isError) {
    return (
      <LoadError
        what="this ingestion"
        message={ingestion.error.message}
        onRetry={() => void ingestion.refetch()}
        retrying={ingestion.isFetching}
      />
    );
  }
  return <Progress detail={ingestion.data} existing={existing} />;
}

function Progress({ detail, existing }: { detail: IngestionDetail; existing: boolean }) {
  const queries = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const refresh = () => {
    void queries.invalidateQueries({ queryKey: adminKeys.ingestion(detail.id) });
    void queries.invalidateQueries({ queryKey: adminKeys.ingestions });
  };
  const failed = (error: Error) =>
    toast({
      title: error instanceof ApiError ? error.message : "That did not work",
      variant: "destructive",
    });
  const cancel = useMutation({
    mutationFn: () => cancelIngestion(detail.id),
    onSuccess: refresh,
    onError: failed,
  });
  const retry = useMutation({
    mutationFn: () => retryIngestion(detail.id),
    onSuccess: refresh,
    onError: failed,
  });
  const discard = useMutation({
    mutationFn: () => discardIngestion(detail.id),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["admin"] });
      toast({ title: "Draft discarded", variant: "success" });
      router.push("/admin/papers");
    },
    onError: failed,
  });

  const stageIndex = STAGES.indexOf(detail.status as (typeof STAGES)[number]);
  const verified = detail.steps.verified;
  const working = ["queued", "reading", "planning", "writing"].includes(detail.status);

  return (
    <div className="grid grid-cols-1 gap-8">
      {existing ? (
        <Alert variant="info" title="This paper was already ingested">
          Uploading the same PDF again returns the ingestion that exists.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={ingestionTone(detail.status)}>
          {INGESTION_STATUS_LABEL[detail.status]}
        </Badge>
        {working ? (
          <span className="text-sm text-muted-foreground">
            Updates every few seconds.
          </span>
        ) : null}
        {stageIndex >= 0 && detail.status !== "ready_for_review" ? (
          <Meter
            className="w-48"
            value={stageIndex}
            max={STAGES.length - 1}
            label="Stages done"
          />
        ) : null}
      </div>

      {detail.error ? (
        <Alert variant="destructive" title="The pipeline stopped">
          {detail.error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {detail.status === "awaiting_plan_review" ? (
          <Link href={`/admin/ingestions/${detail.id}/plan`} className={buttonVariants()}>
            <ClipboardList aria-hidden="true" />
            Review the plan
          </Link>
        ) : null}
        {detail.status === "ready_for_review" || detail.status === "published" ? (
          <Link
            href={`/admin/ingestions/${detail.id}/review`}
            className={buttonVariants()}
          >
            <ClipboardList aria-hidden="true" />
            {detail.status === "published" ? "Edit the paper" : "Review the draft"}
          </Link>
        ) : null}
        {detail.status === "failed" ? (
          <Button onClick={() => retry.mutate()} loading={retry.isPending}>
            <RotateCcw aria-hidden="true" />
            Retry from {detail.failedStage ?? "the start"}
          </Button>
        ) : null}
        {!["published", "cancelled"].includes(detail.status) ? (
          <Button
            variant="outline"
            onClick={() => cancel.mutate()}
            loading={cancel.isPending}
          >
            <SquareX aria-hidden="true" />
            Cancel
          </Button>
        ) : null}
        {detail.status !== "published" ? (
          <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>
            <Trash2 aria-hidden="true" />
            Discard
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="steps-heading" className="grid gap-3">
        <h2 id="steps-heading" className="text-xl font-semibold">
          Steps{" "}
          {detail.stepStates.length > 0
            ? `(${verified} of ${detail.stepStates.length} verified)`
            : ""}
        </h2>
        {detail.stepStates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The steps appear once the plan is made.
          </p>
        ) : (
          <ol className="grid gap-2">
            {detail.stepStates.map((step) => (
              <li
                key={step.stepId}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <span className="w-6 text-right font-mono text-sm text-muted-foreground">
                  {step.position + 1}
                </span>
                <span className="min-w-0 flex-1 font-medium">{step.title}</span>
                <Badge variant={stepTone(step.status)}>
                  {STEP_STATUS_LABEL[step.status]}
                </Badge>
                {step.attempts > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    attempt {step.attempts}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="usage-heading" className="grid gap-2">
        <h2 id="usage-heading" className="text-xl font-semibold">
          Used so far
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Model calls", formatTokens(detail.usage.calls)],
            ["Output tokens", formatTokens(detail.usage.outputTokens)],
            [
              "Input tokens",
              formatTokens(
                detail.usage.inputTokens +
                  detail.usage.cacheReadTokens +
                  detail.usage.cacheWriteTokens,
              ),
            ],
            ["Of which cache reads", formatTokens(detail.usage.cacheReadTokens)],
            ["Sandbox runs", formatTokens(detail.usage.sandboxRuns)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono text-base tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {detail.model}, prompts {detail.promptVersion}
        </p>
      </section>

      <Dialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this draft?"
        description="Its PDF, outline, plan, every attempt and the draft are deleted. This cannot be undone."
        footer={
          <Button
            variant="destructive"
            onClick={() => discard.mutate()}
            loading={discard.isPending}
          >
            Discard for good
          </Button>
        }
      />
    </div>
  );
}
