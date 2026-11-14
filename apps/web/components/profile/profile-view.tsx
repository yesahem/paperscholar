"use client";

import type { PublicProfile } from "@repo/shared";
import { Avatar } from "@repo/ui/components/avatar";
import { buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Meter } from "@repo/ui/components/meter";
import { Skeleton } from "@repo/ui/components/skeleton";
import { CircleCheck, Flame, Settings } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/states/empty-state";
import { LoadError } from "@/components/states/load-error";
import { ApiError } from "@/lib/api/errors";
import { pluralise } from "@/lib/content/format";
import { formatDay, formatMonthYear } from "@/lib/profile/format";
import { useMe, usePaperTitles, usePublicProfile } from "@/lib/queries";
import { ActivityHeatmap } from "./activity-heatmap";
import { FollowButton } from "./follow-button";
import { FollowingList } from "./following-list";

/**
 * A public profile (docs/specs/08-web.md §6): who they are, what they have
 * solved, a year of activity, per-paper progress and who they follow.
 */
export function ProfileView({ username }: { username: string }) {
  const profile = usePublicProfile(username);
  const me = useMe();

  if (profile.isPending) return <ProfileSkeleton />;
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.status === 404) {
      return (
        <EmptyState title={`Nobody here goes by “${username}”.`}>
          Check the spelling, or{" "}
          <Link href="/leaderboard" className="underline underline-offset-4">
            find people on the leaderboard
          </Link>
          .
        </EmptyState>
      );
    }
    return (
      <LoadError
        what="this profile"
        message={profile.error.message}
        onRetry={() => void profile.refetch()}
        retrying={profile.isFetching}
      />
    );
  }

  const data = profile.data;
  const own = me.data?.username === data.username;
  return (
    <div className="flex flex-col gap-10">
      <Header profile={data} own={own} />
      <StatTiles profile={data} />
      <Section title="Activity">
        <ActivityHeatmap activity={data.activity} today={new Date()} />
      </Section>
      <Section title="Papers">
        <PaperList profile={data} own={own} />
      </Section>
      <Section title={`Following · ${data.followingCount}`}>
        <FollowingList username={data.username} own={own} />
      </Section>
    </div>
  );
}

function Header({ profile, own }: { profile: PublicProfile; own: boolean }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <Avatar src={profile.avatarUrl} name={profile.username} size="xl" decorative />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className="truncate text-3xl font-semibold tracking-tight">
          {profile.username}
        </h1>
        {profile.bio ? (
          // Plain text, never markup (docs/specs/11-security-ops.md §4).
          <p className="max-w-2xl whitespace-pre-line text-pretty text-muted-foreground">
            {profile.bio}
          </p>
        ) : null}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Joined {formatMonthYear(profile.joinedAt)}</span>
          <span>
            {pluralise(profile.followerCount, "follower")} · {profile.followingCount}{" "}
            following
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        {own ? (
          <Link
            href="/settings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings aria-hidden="true" />
            Edit profile
          </Link>
        ) : (
          <FollowButton profile={profile} />
        )}
      </div>
    </div>
  );
}

function StatTiles({ profile }: { profile: PublicProfile }) {
  const { stats } = profile;
  const tiles: { label: string; value: number; detail?: ReactNode }[] = [
    {
      label: "Problems solved",
      value: stats.problemsSolved,
      detail: `${stats.easy} easy · ${stats.medium} medium · ${stats.hard} hard`,
    },
    { label: "Papers completed", value: stats.papersCompleted },
    {
      label: "Current streak",
      value: stats.currentStreak,
      detail: stats.currentStreak === 1 ? "day" : "days",
    },
    {
      label: "Longest streak",
      value: stats.longestStreak,
      detail: stats.longestStreak === 1 ? "day" : "days",
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4"
        >
          <dt className="text-sm text-muted-foreground">{tile.label}</dt>
          <dd className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{tile.value}</span>
            {tile.label === "Current streak" && tile.value > 0 ? (
              <Flame aria-hidden="true" className="size-4 text-warning" />
            ) : null}
          </dd>
          {tile.detail ? (
            <dd className="text-xs text-muted-foreground">{tile.detail}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

function PaperList({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const titles = usePaperTitles();
  if (profile.papers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {own ? (
          <>
            Papers you work on appear here once you solve a step.{" "}
            <Link href="/papers" className="underline underline-offset-4">
              Pick a paper
            </Link>
            .
          </>
        ) : (
          `${profile.username} has not solved a step yet.`
        )}
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {profile.papers.map((paper) => {
        const { completedAt } = paper;
        const done = completedAt !== null;
        const title = titles.get(paper.paperId);
        return (
          <li key={paper.paperId}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {title ? (
                    <Link
                      href={`/papers/${paper.paperId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {title}
                    </Link>
                  ) : (
                    // Archived papers keep the learner's progress but have no page.
                    <span className="font-mono text-sm">{paper.paperId}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Meter
                  value={paper.solved}
                  max={paper.total}
                  label={`Steps solved in ${title ?? paper.paperId}`}
                  tone={done ? "success" : "primary"}
                />
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {completedAt !== null ? (
                    <>
                      <CircleCheck aria-hidden="true" className="size-3.5 text-success" />
                      Completed {formatDay(completedAt)}
                    </>
                  ) : (
                    `${paper.solved} of ${paper.total} steps`
                  )}
                </span>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center gap-5">
        <Skeleton className="size-24 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
