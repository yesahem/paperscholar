"use client";

import { ROLES, type Role } from "@repo/shared/accounts";
import type { AdminUser } from "@repo/shared";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Select } from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useToast } from "@repo/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import { useAdminUsers } from "@/lib/admin/queries";
import { setUserRole } from "@/lib/api/admin";
import { ApiError } from "@repo/web-core/api/errors";

const ROLE_LABEL: Record<Role, string> = {
  user: "Learner",
  maintainer: "Maintainer",
  admin: "Admin",
};

/** `/users`: find an account and change its role (admins only; spec 06 §9). */
export function UsersView() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const users = useAdminUsers(deferred);
  return (
    <div className="grid gap-6">
      <Field label="Find an account" description="By the start of its username or email.">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </Field>
      {users.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : users.isError ? (
        <LoadError
          what="the accounts"
          message={users.error.message}
          onRetry={() => void users.refetch()}
        />
      ) : users.data.users.length === 0 ? (
        <EmptyState title="No account matches">
          Try the first letters of a username or an email address.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {users.data.users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const queries = useQueryClient();
  const toast = useToast();
  const change = useMutation({
    mutationFn: (role: Role) => setUserRole(user.id, role),
    onSuccess: (updated) => {
      void queries.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: `${updated.username} is now ${ROLE_LABEL[updated.role].toLowerCase()}`,
        variant: "success",
      });
    },
    onError: (error) =>
      toast({
        title: error instanceof ApiError ? error.message : "Could not change the role",
        variant: "destructive",
      }),
  });
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{user.username}</p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>
      <Select
        aria-label={`Role of ${user.username}`}
        value={user.role}
        disabled={change.isPending}
        onChange={(event) => {
          const role = ROLES.find((candidate) => candidate === event.target.value);
          if (role) change.mutate(role);
        }}
        className="w-40"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </Select>
    </li>
  );
}
