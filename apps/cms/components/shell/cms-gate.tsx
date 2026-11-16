"use client";

import type { Role } from "@repo/shared/accounts";
import { hasRole } from "@repo/shared/accounts";
import { buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useMe } from "@repo/web-core/queries/session";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Shows a screen only to someone signed in with at least `role`. A visitor is
 * sent to the sign-in page; anyone below the role sees the not-found page, as
 * the API answers them (docs/specs/14-cms.md §2). The API enforces the same.
 */
export function CmsGate({
  role = "maintainer",
  children,
}: {
  role?: Role;
  children: ReactNode;
}) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = !me.isPending && !me.data;

  useEffect(() => {
    if (signedOut) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [signedOut, pathname, router]);

  if (me.isPending || signedOut) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (me.data && !hasRole(me.data.role, role)) {
    return (
      <div className="flex flex-col items-start gap-4 py-8">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">The page you asked for does not exist.</p>
        <Link href="/" className={buttonVariants()}>
          Go to the dashboard
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
