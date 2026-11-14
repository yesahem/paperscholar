import { Skeleton } from "@repo/ui/components/skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";
import { UserSearch } from "@/components/leaderboard/user-search";
import { PageContainer, PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Who has implemented the most steps and papers on this site.",
  alternates: { canonical: "/leaderboard" },
};

/**
 * The shell renders on the server; rankings load in the browser
 * (docs/specs/08-web.md §1), so the page stays the same for everyone.
 */
export default function LeaderboardPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Leaderboard"
        description="Ranked by problems solved, papers completed or recent activity. Only passing submits count."
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        {/* min-w-0: the table scrolls inside its box instead of widening the page. */}
        <div className="min-w-0">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <LeaderboardView />
          </Suspense>
        </div>
        <aside aria-label="Find a user">
          <UserSearch />
        </aside>
      </div>
    </PageContainer>
  );
}
