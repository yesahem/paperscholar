import type { Metadata } from "next";
import { PageFrame } from "@/components/shell/page-frame";
import { NewPaperForm } from "@/components/papers/new-paper-form";

export const metadata: Metadata = { title: "Upload a paper", robots: { index: false } };

export default function NewPaperPage() {
  return (
    <PageFrame
      title="Upload a paper"
      description="The pipeline reads the paper, plans a learning path, writes every step and proves each one in the sandbox. Nothing is published until you publish it."
    >
      <NewPaperForm />
    </PageFrame>
  );
}
