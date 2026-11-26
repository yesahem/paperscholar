"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import { STATUS_LABEL } from "@/lib/cold-mail/format";
import { useColdMails } from "@/lib/queries";

/** Earlier drafts, newest first; each opens in the draft view. */
export function DraftHistory({
  selected,
  onOpen,
}: {
  selected: string | null;
  onOpen: (id: string) => void;
}) {
  const history = useColdMails();
  if (history.isPending) return <Skeleton className="h-32 w-full" />;
  if (history.isError) {
    return (
      <LoadError
        what="your drafts"
        message={history.error.message}
        onRetry={() => void history.refetch()}
        retrying={history.isFetching}
      />
    );
  }
  const items = history.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <EmptyState title="No drafts yet">
        Drafts you write appear here, newest first.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((mail) => (
          <li
            key={mail.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {mail.subject ?? `To ${mail.target.name}, ${mail.target.organisation}`}
              </p>
              <p className="text-muted-foreground">
                {mail.target.name} · {new Date(mail.createdAt).toLocaleString()}
              </p>
            </div>
            <Badge
              variant={
                mail.status === "done"
                  ? "success"
                  : mail.status === "failed"
                    ? "secondary"
                    : "warning"
              }
            >
              {STATUS_LABEL[mail.status]}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              aria-current={selected === mail.id ? "true" : undefined}
              onClick={() => onOpen(mail.id)}
            >
              Open
            </Button>
          </li>
        ))}
      </ul>
      {history.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-start"
          loading={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Show older drafts
        </Button>
      ) : null}
    </div>
  );
}
