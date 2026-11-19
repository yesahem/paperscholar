"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import { ATTEMPT_STATUS_LABEL, scoreSummary } from "@/lib/exams/quiz";
import { useExamAttempts } from "@/lib/queries";

/** The signed-in user's past attempts; graded ones can be reviewed, running ones resumed. */
export function AttemptHistory({
  opening,
  onOpen,
}: {
  /** The attempt being loaded, if any. */
  opening: string | null;
  onOpen: (attemptId: string) => void;
}) {
  const attempts = useExamAttempts(true);

  if (attempts.isPending) return <Skeleton className="h-32 w-full" />;
  if (attempts.isError) {
    return (
      <LoadError
        what="your quiz history"
        message={attempts.error.message}
        onRetry={() => void attempts.refetch()}
        retrying={attempts.isFetching}
      />
    );
  }
  const items = attempts.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <EmptyState title="No quizzes yet">
        Your graded quizzes appear here, with every answer explained.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((attempt) => (
          <li
            key={attempt.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {attempt.topics.map((topic) => topic.title).join(", ")}
              </p>
              <p className="text-muted-foreground">
                {new Date(attempt.startedAt).toLocaleString()}
                {attempt.score !== null
                  ? ` · ${scoreSummary(attempt.score, attempt.total)}`
                  : ""}
              </p>
            </div>
            <Badge
              variant={
                attempt.status === "submitted"
                  ? "success"
                  : attempt.status === "expired"
                    ? "secondary"
                    : "warning"
              }
            >
              {ATTEMPT_STATUS_LABEL[attempt.status]}
            </Badge>
            {attempt.status === "expired" ? null : (
              <Button
                size="sm"
                variant="outline"
                loading={opening === attempt.id}
                onClick={() => onOpen(attempt.id)}
              >
                {attempt.status === "submitted" ? "Review" : "Resume"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {attempts.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-start"
          loading={attempts.isFetchingNextPage}
          onClick={() => void attempts.fetchNextPage()}
        >
          Show older quizzes
        </Button>
      ) : null}
    </div>
  );
}
