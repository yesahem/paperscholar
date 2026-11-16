import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageFrame } from "@/components/shell/page-frame";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PageFrame
      title="Dashboard"
      description="What the paper pipeline is doing, what it has cost, and what failed."
    >
      <DashboardView />
    </PageFrame>
  );
}
