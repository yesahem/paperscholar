"use client";

import { Skeleton } from "@repo/ui/components/skeleton";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/lib/queries";

/** `/profile`: the signed-in user's own profile, or sign-in first (docs/specs/08-web.md §2). */
export function OwnProfileRedirect() {
  const me = useMe();
  const router = useRouter();
  const target = me.isPending
    ? null
    : me.data
      ? `/profile/${me.data.username}`
      : `/login?next=${encodeURIComponent("/profile")}`;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Opening your profile…</span>
      <Skeleton className="size-24 rounded-full" />
      <Skeleton className="h-8 w-48" />
    </div>
  );
}
