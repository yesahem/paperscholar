import type { Metadata } from "next";
import { PageFrame } from "@/components/shell/page-frame";
import { PapersView } from "@/components/papers/papers-view";

export const metadata: Metadata = { title: "Manage papers", robots: { index: false } };

export default function AdminPapersPage() {
  return (
    <PageFrame
      title="Papers"
      description="Published papers, drafts, and papers the pipeline is working on."
    >
      <PapersView />
    </PageFrame>
  );
}
