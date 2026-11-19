import type { Metadata } from "next";
import { FeedbackInbox } from "@/components/feedback/feedback-inbox";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCmsEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Feedback", robots: { index: false } };

export default function FeedbackPage() {
  return (
    <PageFrame
      title="Feedback"
      description="Bug reports from learners, including those filed from a step, and reviews waiting for approval. Maintainers resolve reports; admins approve reviews."
    >
      <FeedbackInbox siteUrl={loadCmsEnv().NEXT_PUBLIC_SITE_URL} />
    </PageFrame>
  );
}
