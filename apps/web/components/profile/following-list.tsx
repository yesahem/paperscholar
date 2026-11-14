"use client";

import { Avatar } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LoadError } from "@/components/states/load-error";
import { getFollowing } from "@/lib/api/users";
import { queryKeys } from "@/lib/queries";

/** Who `username` follows, 20 at a time. */
export function FollowingList({ username, own }: { username: string; own: boolean }) {
  const list = useInfiniteQuery({
    queryKey: queryKeys.following(username),
    queryFn: ({ pageParam, signal }) => getFollowing(username, pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 30_000,
  });

  if (list.isPending) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-full" />
        ))}
      </div>
    );
  }
  if (list.isError) {
    return (
      <LoadError
        what="who this user follows"
        message={list.error.message}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  }
  const people = list.data.pages.flatMap((page) => page.items);
  if (people.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {own
          ? "You follow nobody yet. Find people on the leaderboard and follow them to keep up."
          : `${username} follows nobody yet.`}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {people.map((person) => (
          <li key={person.username}>
            <Link
              href={`/profile/${person.username}`}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm hover:border-ring focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Avatar
                src={person.avatarUrl}
                name={person.username}
                size="sm"
                decorative
              />
              {person.username}
            </Link>
          </li>
        ))}
      </ul>
      {list.hasNextPage ? (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Show more
        </Button>
      ) : null}
    </div>
  );
}
