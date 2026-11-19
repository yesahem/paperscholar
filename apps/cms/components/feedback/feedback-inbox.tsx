"use client";

import type { AdminFeedbackItem, FeedbackStatus, FeedbackType } from "@repo/shared";
import { hasRole } from "@repo/shared/accounts";
import { BUG_STATUSES, REVIEW_STATUSES } from "@repo/shared/feedback";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Dialog } from "@repo/ui/components/dialog";
import { Field } from "@repo/ui/components/field";
import { Select } from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Tab, TabList, TabPanel, Tabs } from "@repo/ui/components/tabs";
import { useToast } from "@repo/ui/components/toast";
import { ApiError } from "@repo/web-core/api/errors";
import { useMe } from "@repo/web-core/queries/session";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { adminKeys, useFeedbackInbox } from "@/lib/admin/queries";
import { deleteFeedback, setFeedbackStatus } from "@/lib/api/cms";
import { reportLinks } from "@/lib/feedback/links";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  pending: "Waiting for approval",
  approved: "Published",
  rejected: "Rejected",
};

/** The first status each tab shows: what still needs someone. */
const DEFAULT_STATUS: Record<FeedbackType, FeedbackStatus> = {
  bug: "open",
  review: "pending",
};

/**
 * `/feedback`: bug reports, including "report a problem with this step" from
 * the workspace, and reviews waiting for approval (docs/specs/14-cms.md §6).
 */
export function FeedbackInbox({ siteUrl }: { siteUrl: string }) {
  const [type, setType] = useState<FeedbackType>("bug");
  return (
    <Tabs
      defaultValue="bug"
      value={type}
      onValueChange={(value) => setType(value === "review" ? "review" : "bug")}
      className="grid gap-4"
    >
      <TabList aria-label="Feedback">
        <Tab value="bug">Bug reports</Tab>
        <Tab value="review">Reviews</Tab>
      </TabList>
      <TabPanel value="bug">
        <InboxList type="bug" siteUrl={siteUrl} />
      </TabPanel>
      <TabPanel value="review">
        <InboxList type="review" siteUrl={siteUrl} />
      </TabPanel>
    </Tabs>
  );
}

function InboxList({ type, siteUrl }: { type: FeedbackType; siteUrl: string }) {
  const [status, setStatus] = useState<FeedbackStatus | null>(DEFAULT_STATUS[type]);
  const inbox = useFeedbackInbox(type, status);
  const statuses: readonly FeedbackStatus[] =
    type === "bug" ? BUG_STATUSES : REVIEW_STATUSES;

  return (
    <div className="grid gap-4">
      <Field label="Show" className="max-w-xs">
        <Select
          value={status ?? ""}
          onChange={(event) =>
            setStatus(
              statuses.find((candidate) => candidate === event.target.value) ?? null,
            )
          }
        >
          {statuses.map((candidate) => (
            <option key={candidate} value={candidate}>
              {STATUS_LABEL[candidate]}
            </option>
          ))}
          <option value="">Everything</option>
        </Select>
      </Field>
      {inbox.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : inbox.isError ? (
        <LoadError
          what="the inbox"
          message={inbox.error.message}
          onRetry={() => void inbox.refetch()}
          retrying={inbox.isFetching}
        />
      ) : inbox.data.pages[0]?.items.length === 0 ? (
        <EmptyState title={type === "bug" ? "No bug reports here" : "No reviews here"}>
          {type === "bug"
            ? "Reports learners file from a step, or from the Feedback page, appear here."
            : "Reviews learners write appear here for approval before they are published."}
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-3">
            {inbox.data.pages
              .flatMap((page) => page.items)
              .map((item) => (
                <InboxItem key={item.id} item={item} siteUrl={siteUrl} />
              ))}
          </ul>
          {inbox.hasNextPage ? (
            <Button
              variant="outline"
              className="justify-self-start"
              loading={inbox.isFetchingNextPage}
              onClick={() => void inbox.fetchNextPage()}
            >
              Show older
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function InboxItem({ item, siteUrl }: { item: AdminFeedbackItem; siteUrl: string }) {
  const me = useMe();
  const queries = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const isAdmin = me.data ? hasRole(me.data.role, "admin") : false;
  const links = reportLinks(item, siteUrl);
  const refresh = () => void queries.invalidateQueries({ queryKey: adminKeys.feedback });
  const failed = (error: Error) =>
    toast({
      title: error instanceof ApiError ? error.message : "That did not work",
      variant: "destructive",
    });

  const change = useMutation({
    mutationFn: (status: FeedbackStatus) => setFeedbackStatus(item.id, status),
    onSuccess: (updated) => {
      refresh();
      toast({ title: STATUS_LABEL[updated.status], variant: "success" });
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: () => deleteFeedback(item.id),
    onSuccess: () => {
      setConfirming(false);
      refresh();
      toast({ title: "Deleted", variant: "success" });
    },
    onError: failed,
  });

  const actions: { status: FeedbackStatus; label: string }[] =
    item.type === "bug"
      ? [
          item.status === "open"
            ? { status: "resolved", label: "Mark resolved" }
            : { status: "open", label: "Reopen" },
        ]
      : isAdmin
        ? REVIEW_STATUSES.filter(
            (status) => status !== item.status && status !== "pending",
          ).map((status) => ({
            status,
            label: status === "approved" ? "Approve" : "Reject",
          }))
        : [];

  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge
          variant={
            item.status === "open" || item.status === "pending"
              ? "warning"
              : item.status === "rejected"
                ? "secondary"
                : "success"
          }
        >
          {STATUS_LABEL[item.status]}
        </Badge>
        <span className="font-medium">
          {item.author.username ?? "An account without a username"}
        </span>
        <span className="text-muted-foreground">
          {new Date(item.createdAt).toLocaleString()}
        </span>
        {item.rating !== null ? (
          <span className="text-muted-foreground">Rated {item.rating} out of 5</span>
        ) : null}
      </div>
      {item.paperId && item.problemId ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>
            Step <span className="font-mono">{item.problemId}</span> of{" "}
            <span className="font-mono">{item.paperId}</span>
          </span>
          {links.review ? (
            <Link href={links.review} className="underline underline-offset-4">
              Open in review
            </Link>
          ) : (
            <span className="text-muted-foreground">
              Not from the pipeline: fix it in the content library.
            </span>
          )}
          {links.step ? (
            <a
              href={links.step}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              View on the site
            </a>
          ) : null}
        </p>
      ) : null}
      <p className="text-sm whitespace-pre-wrap">{item.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.status}
            size="sm"
            variant="outline"
            loading={change.isPending && change.variables === action.status}
            disabled={change.isPending}
            onClick={() => change.mutate(action.status)}
          >
            {action.label}
          </Button>
        ))}
        {item.type === "review" && !isAdmin ? (
          <span className="text-sm text-muted-foreground">
            An admin approves or rejects reviews.
          </span>
        ) : null}
        {isAdmin ? (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
      </div>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this item for good?"
        description="The author will no longer see it either. Resolving or rejecting keeps a record."
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
