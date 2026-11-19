import type { Metadata } from "next";
import { QuizView } from "@/components/exams/quiz-view";
import { PageContainer, PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Quiz",
  description:
    "Timed multiple-choice practice by topic, graded with an explanation for every answer.",
  alternates: { canonical: "/test" },
};

/** Quiz mode (docs/specs/08-web.md §2): the shell renders on the server, the quiz in the browser. */
export default function QuizPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Quiz"
        description="Pick one or more topics and answer against the clock. Each answer is explained once you submit."
      />
      <QuizView />
    </PageContainer>
  );
}
