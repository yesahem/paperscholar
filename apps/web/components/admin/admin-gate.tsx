"use client";

import type { Role } from "@repo/shared/accounts";
import { hasRole } from "@repo/shared/accounts";
import { buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMe } from "@/lib/queries";

/**
 * Shows the maintainer screens only to maintainers and admins; everyone else
 * sees the not-found page, as the API answers them (docs/specs/08-web.md §2).
 */
export function AdminGate({
  role = "maintainer",
  children,
}: {
  role?: Role;
  children: ReactNode;
}) {
  const me = useMe();
  if (me.isPending) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!me.data || !hasRole(me.data.role, role)) {
    return (
      <div className="flex flex-col items-start gap-4 py-8">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">
          The page you asked for does not exist, has moved, or is not published on this
          instance.
        </p>
        <Link href="/papers" className={buttonVariants()}>
          Browse papers
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
