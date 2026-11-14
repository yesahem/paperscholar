"use client";

import type { LeaderboardEntry } from "@repo/shared";
import { LEADERBOARD_SORTS, type LeaderboardSort } from "@repo/shared/progress";
import { Avatar } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Tab, TabList, TabPanel, Tabs } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/cn";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { LoadError } from "@/components/states/load-error";
import {
  leaderboardViewToParams,
  offsetOf,
  pageCount,
  pageOfRank,
  parseLeaderboardView,
  SORT_LABELS,
  type LeaderboardView as View,
} from "@/lib/leaderboard/params";
import { formatRecentDay } from "@/lib/profile/format";
import { useLeaderboard, useLeaderboardRank, useMe } from "@/lib/queries";

/**
 * Rankings with three sorts, 50 per page, and the signed-in user's own rank
 * pinned above them (docs/specs/08-web.md §6). The view is kept in the URL.
 */
export function LeaderboardView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = parseLeaderboardView(new URLSearchParams(params.toString()));
  const go = (next: View) => {
    const query = leaderboardViewToParams(next).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <Tabs
      defaultValue="problems_solved"
      value={view.sort}
      onValueChange={(sort) => {
        const next = LEADERBOARD_SORTS.find((candidate) => candidate === sort);
        if (next) go({ sort: next, page: 1 });
      }}
      className="gap-4"
    >
      <TabList aria-label="Rank by">
        {LEADERBOARD_SORTS.map((sort) => (
          <Tab key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </Tab>
        ))}
      </TabList>
      {LEADERBOARD_SORTS.map((sort) => (
        <TabPanel key={sort} value={sort} className="flex flex-col gap-4">
          {sort === view.sort ? (
            <>
              <OwnRank sort={sort} onShow={(page) => go({ sort, page })} />
              <Rankings view={view} onPage={(page) => go({ sort, page })} />
            </>
          ) : null}
        </TabPanel>
      ))}
    </Tabs>
  );
}

function OwnRank({
  sort,
  onShow,
}: {
  sort: LeaderboardSort;
  onShow: (page: number) => void;
}) {
  const me = useMe();
  const dialog = useAuthDialog();
  const rank = useLeaderboardRank(sort, Boolean(me.data));

  if (me.isPending || (me.data && rank.isPending)) {
    return <Skeleton className="h-14 w-full" />;
  }
  if (!me.data) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Sign in to see where you rank, and solve problems to climb.
        </span>
        <Button size="sm" variant="outline" onClick={() => dialog.open("sign-in")}>
          Sign in
        </Button>
      </div>
    );
  }
  if (rank.isError) {
    return (
      <LoadError
        what="your rank"
        message={rank.error.message}
        onRetry={() => void rank.refetch()}
        retrying={rank.isFetching}
      />
    );
  }
  const position = rank.data?.rank ?? null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-accent/40 px-4 py-3 text-sm">
      <span className="inline-flex items-center gap-2">
        <Trophy aria-hidden="true" className="size-4 text-primary" />
        {position === null ? (
          <span>Solve a problem with Submit to appear on the leaderboard.</span>
        ) : (
          <span>
            You are <span className="font-semibold">#{position}</span> by{" "}
            {SORT_LABELS[sort].toLowerCase()}.
          </span>
        )}
      </span>
      {position === null ? (
        <Link href="/papers" className="underline underline-offset-4">
          Find a problem
        </Link>
      ) : (
        <Button size="sm" variant="outline" onClick={() => onShow(pageOfRank(position))}>
          Show my place
        </Button>
      )}
    </div>
  );
}

function Rankings({ view, onPage }: { view: View; onPage: (page: number) => void }) {
  const board = useLeaderboard(view.sort, offsetOf(view.page));
  const me = useMe();

  if (board.isPending) return <RankingsSkeleton />;
  if (board.isError) {
    return (
      <LoadError
        what="the leaderboard"
        message={board.error.message}
        onRetry={() => void board.refetch()}
        retrying={board.isFetching}
      />
    );
  }
  const { items, total } = board.data;
  if (total === 0) {
    return (
      <EmptyState title="Nobody has solved a problem on this site yet.">
        Submit a passing solution to any step and you will be first.{" "}
        <Link href="/papers" className="underline underline-offset-4">
          Browse papers
        </Link>
      </EmptyState>
    );
  }
  const pages = pageCount(total);
  if (items.length === 0) {
    return (
      <EmptyState title="This page is past the end of the leaderboard.">
        <Button size="sm" variant="outline" onClick={() => onPage(1)}>
          Back to the first page
        </Button>
      </EmptyState>
    );
  }
  const now = new Date();
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className={cn("w-full text-sm", board.isPlaceholderData && "opacity-60")}>
          <caption className="sr-only">
            Leaderboard by {SORT_LABELS[view.sort].toLowerCase()}, page {view.page} of{" "}
            {pages}
          </caption>
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-16 px-4 py-2 font-medium">
                Rank
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                User
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Problems
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Papers
              </th>
              <th
                scope="col"
                className="hidden px-4 py-2 text-right font-medium sm:table-cell"
              >
                Last solve
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((entry) => (
              <Row
                key={entry.username}
                entry={entry}
                mine={entry.username === me.data?.username}
                now={now}
              />
            ))}
          </tbody>
        </table>
      </div>
      <nav
        aria-label="Leaderboard pages"
        className="flex items-center justify-between gap-3 text-sm"
      >
        <Button
          size="sm"
          variant="outline"
          disabled={view.page <= 1}
          onClick={() => onPage(view.page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {view.page} of {pages} · {total} {total === 1 ? "person" : "people"}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={view.page >= pages}
          onClick={() => onPage(view.page + 1)}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}

function Row({
  entry,
  mine,
  now,
}: {
  entry: LeaderboardEntry;
  mine: boolean;
  now: Date;
}) {
  return (
    <tr className={cn(mine && "bg-accent/40")}>
      <td className="px-4 py-2 font-mono tabular-nums">#{entry.rank}</td>
      <td className="px-4 py-2">
        <Link
          href={`/profile/${entry.username}`}
          className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline"
        >
          <Avatar src={entry.avatarUrl} name={entry.username} size="sm" decorative />
          {entry.username}
          {mine ? (
            <span className="text-xs font-normal text-muted-foreground">(you)</span>
          ) : null}
        </Link>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">{entry.problemsSolved}</td>
      <td className="px-4 py-2 text-right tabular-nums">{entry.papersCompleted}</td>
      <td className="hidden px-4 py-2 text-right text-muted-foreground sm:table-cell">
        {entry.lastSolvedAt ? formatRecentDay(entry.lastSolvedAt, now) : "—"}
      </td>
    </tr>
  );
}

function RankingsSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-2.5">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-10" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );
}
