import type { Metadata } from "next";
import { FeedbackView } from "@/components/feedback/feedback-view";
import { ReviewList } from "@/components/feedback/review-list";
import { PageContainer, PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Feedback",
  description:
    "What learners say about the site, and how to tell the maintainers what to fix.",
  alternates: { canonical: "/feedback" },
};

/**
 * Reviews and bug reports (docs/specs/10-secondary-features.md §4). Approved
 * reviews are public; sending feedback needs an account.
 */
export default function FeedbackPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Feedback"
        description="Tell us what works and what does not. Reviews are published after an admin reads them; bug reports go to the maintainers only."
      />
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <FeedbackView />
        <section aria-labelledby="reviews" className="grid content-start gap-4">
          <h2 id="reviews" className="text-lg font-semibold">
            Reviews
          </h2>
          <ReviewList />
        </section>
      </div>
    </PageContainer>
  );
}
