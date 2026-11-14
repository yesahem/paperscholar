"use client";

import { USER_SEARCH_MIN_LENGTH } from "@repo/shared/progress";
import { Avatar } from "@repo/ui/components/avatar";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Spinner } from "@repo/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { searchUsers } from "@/lib/api/users";

const DEBOUNCE_MS = 250;
const USERNAME_CHARACTERS = /^[a-z0-9_]*$/;

/** Find a user by the start of their username (`GET /v1/users?q=`). */
export function UserSearch() {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const normalised = typed.trim().toLowerCase();
  const valid = USERNAME_CHARACTERS.test(normalised);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(valid ? normalised : ""), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalised, valid]);

  const ready = query.length >= USER_SEARCH_MIN_LENGTH;
  const results = useQuery({
    queryKey: ["user-search", query],
    queryFn: ({ signal }) => searchUsers(query, { signal }),
    enabled: ready,
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div role="search" aria-label="Find a user" className="flex flex-col gap-3">
      <Field
        label="Find a user"
        description={`Type at least ${USER_SEARCH_MIN_LENGTH} characters of a username.`}
        error={valid ? undefined : "Usernames have only letters, digits and underscores."}
      >
        <Input
          type="search"
          value={typed}
          autoComplete="off"
          spellCheck={false}
          placeholder="ada_l"
          onChange={(event) => setTyped(event.target.value)}
        />
      </Field>
      <div aria-live="polite" className="min-h-6 text-sm">
        {!ready ? null : results.isPending ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-4" />
            Searching…
          </span>
        ) : results.isError ? (
          <span className="text-destructive">
            {results.error instanceof ApiError
              ? results.error.message
              : "The search failed. Try again."}
          </span>
        ) : results.data.items.length === 0 ? (
          <span className="text-muted-foreground">
            No username starts with “{query}”.
          </span>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {results.data.items.map((user) => (
              <li key={user.username}>
                <Link
                  href={`/profile/${user.username}`}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <Avatar
                    src={user.avatarUrl}
                    name={user.username}
                    size="sm"
                    decorative
                  />
                  <span className="font-medium">{user.username}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
