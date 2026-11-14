"use client";

import type { SubmissionSummary } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { getSubmission, listProblemSubmissions } from "@/lib/api/submissions";
import { queryKeys } from "@/lib/queries";
import { formatDuration, VERDICT_LABELS } from "@/lib/submissions/describe";

export interface SubmissionsPanelProps {
  paperId: string;
  problemId: string;
  signedIn: boolean;
  /** Signed in with a confirmed email where the instance requires one: history is readable. */
  canRun: boolean;
  /** Puts a past submission's code into the editor. */
  onRestore: (code: string) => void;
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** The Submissions tab (docs/specs/08-web.md §5.1): this problem's history, newest first. */
export function SubmissionsPanel({
  paperId,
  problemId,
  signedIn,
  canRun,
  onRestore,
}: SubmissionsPanelProps) {
  const history = useInfiniteQuery({
    queryKey: queryKeys.problemSubmissions(paperId, problemId),
    queryFn: ({ pageParam, signal }) =>
      listProblemSubmissions(paperId, problemId, {
        cursor: pageParam ?? undefined,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: canRun,
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status !== null && error.status < 500) &&
      failures < 2,
  });
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <p className="p-4 text-sm text-muted-foreground sm:p-6">
        Sign in to see your submissions.
      </p>
    );
  }
  if (!canRun) {
    return (
      <p className="p-4 text-sm text-muted-foreground sm:p-6">
        Confirm your email to run code and keep a history here.
      </p>
    );
  }
  if (history.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4 sm:p-6" aria-busy="true">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (history.isError) {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="destructive" title="Could not load your submissions">
          <Button size="sm" variant="outline" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </Alert>
      </div>
    );
  }

  const items = history.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground sm:p-6">
        No runs yet for this step.
      </p>
    );
  }

  async function restore(item: SubmissionSummary) {
    setRestoring(item.id);
    setRestoreError(null);
    try {
      onRestore((await getSubmission(item.id)).code);
    } catch {
      setRestoreError("Could not load that code. Try again.");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:p-6">
      {restoreError ? <Alert variant="destructive">{restoreError}</Alert> : null}
      <ul
        aria-label="Your submissions"
        className="flex flex-col divide-y divide-border rounded-lg border border-border"
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
          >
            <Badge variant={item.mode === "submit" ? "secondary" : "outline"}>
              {item.mode === "submit" ? "Submit" : "Run"}
            </Badge>
            <span
              className={
                item.verdict === "passed" ? "font-medium text-success" : "font-medium"
              }
            >
              {item.verdict ? VERDICT_LABELS[item.verdict] : "In progress"}
            </span>
            {item.testsTotal !== null && item.verdict !== "internal_error" ? (
              <span className="text-muted-foreground">
                {item.testsPassed}/{item.testsTotal}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {formatDuration(item.durationMs)}
            </span>
            <time
              dateTime={item.createdAt}
              className="ml-auto text-xs text-muted-foreground"
            >
              {dateTime.format(new Date(item.createdAt))}
            </time>
            <Button
              size="sm"
              variant="ghost"
              loading={restoring === item.id}
              onClick={() => void restore(item)}
              aria-label={`Restore the code from ${dateTime.format(new Date(item.createdAt))} into the editor`}
            >
              <Undo2 aria-hidden="true" />
              Restore
            </Button>
          </li>
        ))}
      </ul>
      {history.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          loading={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Show older
        </Button>
      ) : null}
    </div>
  );
}
