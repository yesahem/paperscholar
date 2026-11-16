import type { Metadata } from "next";
import { PageFrame } from "@/components/shell/page-frame";
import { PlanEditor } from "@/components/ingestions/plan-editor";

export const metadata: Metadata = { title: "Plan review", robots: { index: false } };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageFrame
      title="Review the plan"
      description="Reorder, rename or remove steps, then let the pipeline write them. A step must come after the steps it builds on."
    >
      <PlanEditor id={id} />
    </PageFrame>
  );
}
