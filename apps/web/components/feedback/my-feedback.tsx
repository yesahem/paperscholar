"use client";

import type { FeedbackItem } from "@repo/shared";
import { FEEDBACK_BODY_MAX_LENGTH } from "@repo/shared/feedback";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Dialog } from "@repo/ui/components/dialog";
import { Field } from "@repo/ui/components/field";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { ApiError } from "@repo/web-core/api/errors";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { deleteFeedback, updateFeedback } from "@/lib/api/feedback";
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_TYPE_LABEL,
  charactersLeft,
  ratingLabel,
} from "@/lib/feedback/format";
import { queryKeys, useMyFeedback } from "@/lib/queries";

/** The signed-in user's own reviews and bug reports, with edit and delete. */
export function MyFeedback() {
  const mine = useMyFeedback(true);
  if (mine.isPending) return <Skeleton className="h-32 w-full" />;
  if (mine.isError) {
    return (
      <LoadError
        what="your messages"
        message={mine.error.message}
        onRetry={() => void mine.refetch()}
        retrying={mine.isFetching}
      />
    );
  }
  const items = mine.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <EmptyState title="Nothing sent yet">
        Reviews and bug reports you send, including reports from a step, appear here.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {items.map((item) => (
          <FeedbackRow key={item.id} item={item} />
        ))}
      </ul>
      {mine.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-start"
          loading={mine.isFetchingNextPage}
          onClick={() => void mine.fetchNextPage()}
        >
          Show older messages
        </Button>
      ) : null}
    </div>
  );
}

function FeedbackRow({ item }: { item: FeedbackItem }) {
  const queries = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [confirming, setConfirming] = useState(false);
  const refresh = () =>
    void queries.invalidateQueries({ queryKey: queryKeys.myFeedback });
  const failed = (error: Error) =>
    toast({
      title: error instanceof ApiError ? error.message : "That did not work. Try again.",
      variant: "destructive",
    });

  const save = useMutation({
    mutationFn: () => updateFeedback(item.id, { body: draft }),
    onSuccess: () => {
      setEditing(false);
      refresh();
      toast({
        title:
          item.type === "review"
            ? "Saved. An admin will approve the new text before it is shown."
            : "Saved",
        variant: "success",
      });
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: () => deleteFeedback(item.id),
    onSuccess: () => {
      setConfirming(false);
      refresh();
      void queries.invalidateQueries({ queryKey: queryKeys.reviews });
      toast({ title: "Deleted", variant: "success" });
    },
    onError: failed,
  });
  const tooLong = draft.trim().length > FEEDBACK_BODY_MAX_LENGTH;

  return (
    <li className="grid gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{FEEDBACK_TYPE_LABEL[item.type]}</span>
        <Badge
          variant={
            item.status === "approved" || item.status === "resolved"
              ? "success"
              : item.status === "rejected"
                ? "secondary"
                : "warning"
          }
        >
          {FEEDBACK_STATUS_LABEL[item.status]}
        </Badge>
        {item.rating !== null ? (
          <span className="text-muted-foreground">{ratingLabel(item.rating)}</span>
        ) : null}
        <span className="text-muted-foreground">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
        {item.paperId && item.problemId ? (
          <Link
            href={`/papers/${item.paperId}/problems/${item.problemId}`}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            The step it is about
          </Link>
        ) : null}
      </div>
      {editing ? (
        <div className="grid gap-3">
          <Field
            label="Text"
            description={`${charactersLeft(draft, FEEDBACK_BODY_MAX_LENGTH)}.`}
            error={tooLong ? "That is longer than the limit." : undefined}
          >
            <Textarea
              rows={4}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={save.isPending}
              disabled={draft.trim().length === 0 || tooLong}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(item.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap">{item.body}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete this ${item.type === "review" ? "review" : "bug report"}?`}
        description="It is removed for good, also from the maintainers' inbox."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete
            </Button>
          </>
        }
      />
    </li>
  );
}
