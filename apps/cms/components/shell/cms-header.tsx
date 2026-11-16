"use client";

import { SITE } from "@repo/shared/site";
import { hasRole } from "@repo/shared/accounts";
import { buttonVariants, Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/cn";
import { signOut } from "@repo/web-core/auth/auth-api";
import { useMe, useRefreshMe } from "@repo/web-core/queries/session";
import { ThemeToggle } from "@repo/web-core/theme/theme-toggle";
import { LogOut, PenSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NavLink } from "./nav-link";

const NAVIGATION = [
  { href: "/", label: "Dashboard", role: "maintainer" },
  { href: "/papers", label: "Papers", role: "maintainer" },
  { href: "/tracks", label: "Tracks", role: "maintainer" },
  { href: "/users", label: "Roles", role: "admin" },
  { href: "/eval", label: "Eval", role: "admin" },
] as const;

/** The CMS header: navigation by role, the learner site, the theme and the account. */
export function CmsHeader({ siteUrl }: { siteUrl: string }) {
  const me = useMe();
  const refreshMe = useRefreshMe();
  const router = useRouter();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const role = me.data?.role ?? null;

  async function leave() {
    setSignOutFailed(false);
    try {
      await signOut();
      await refreshMe();
      router.replace("/sign-in");
    } catch {
      setSignOutFailed(true);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
        >
          <PenSquare aria-hidden="true" className="size-5 text-primary" />
          {SITE.name} CMS
        </Link>
        <nav aria-label="Main" className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {role
              ? NAVIGATION.filter((item) => hasRole(role, item.role)).map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href}>{item.label}</NavLink>
                  </li>
                ))
              : null}
          </ul>
        </nav>
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "hidden sm:inline-flex",
          )}
        >
          Learner site
        </a>
        <ThemeToggle />
        {me.isPending ? (
          <Skeleton className="h-8 w-20" />
        ) : me.data ? (
          <div className="flex items-center gap-2">
            {signOutFailed ? (
              <span role="alert" className="text-xs text-destructive">
                Sign-out failed
              </span>
            ) : null}
            <span className="hidden max-w-32 truncate text-sm text-muted-foreground sm:inline">
              {me.data.username}
            </span>
            <Button size="sm" variant="outline" onClick={() => void leave()}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
