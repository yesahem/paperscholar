import type { Metadata } from "next";
import { EvalView } from "@/components/eval/eval-view";
import { PageFrame } from "@/components/shell/page-frame";

export const metadata: Metadata = { title: "Eval" };

export default function EvalPage() {
  return (
    <PageFrame
      title="Quality eval"
      description="Run the pipeline on the reference papers and measure how much of its work holds up without a human."
      role="admin"
    >
      <EvalView />
    </PageFrame>
  );
}
