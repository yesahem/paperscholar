"use client";

import { Avatar } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import Link from "next/link";
import { ratingLabel } from "@/lib/feedback/format";
import { useReviews } from "@/lib/queries";

/** Approved reviews, newest first. Bodies are plain text (docs/specs/11-security-ops.md §4). */
export function ReviewList() {
  const reviews = useReviews();
  if (reviews.isPending) return <Skeleton className="h-40 w-full" />;
  if (reviews.isError) {
    return (
      <LoadError
        what="the reviews"
        message={reviews.error.message}
        onRetry={() => void reviews.refetch()}
        retrying={reviews.isFetching}
      />
    );
  }
  const items = reviews.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <EmptyState title="No reviews yet">
        Reviews appear here once an admin has approved them. Write the first one.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {items.map((review) => (
          <li
            key={review.id}
            className="grid gap-2 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Avatar
                src={review.author.avatarUrl}
                name={review.author.username}
                size="sm"
                decorative
              />
              <Link
                href={`/profile/${review.author.username}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {review.author.username}
              </Link>
              {review.rating !== null ? (
                <span className="text-muted-foreground">
                  {ratingLabel(review.rating)}
                </span>
              ) : null}
              <span className="text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{review.body}</p>
          </li>
        ))}
      </ul>
      {reviews.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-start"
          loading={reviews.isFetchingNextPage}
          onClick={() => void reviews.fetchNextPage()}
        >
          Show more reviews
        </Button>
      ) : null}
    </div>
  );
}
