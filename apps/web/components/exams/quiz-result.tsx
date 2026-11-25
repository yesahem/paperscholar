"use client";

import type { SubmittedExamAttempt } from "@repo/shared";
import { Button } from "@repo/ui/components/button";
import { scoreSummary } from "@/lib/exams/quiz";
import { GradedQuestion } from "./graded-question";

/** A graded attempt: the score, then each question with the right answer and why. */
export function QuizResult({
  attempt,
  onDone,
}: {
  attempt: SubmittedExamAttempt;
  onDone: () => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">
            Score: {scoreSummary(attempt.score, attempt.total)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {attempt.topics.map((topic) => topic.title).join(", ")} · graded{" "}
            {new Date(attempt.submittedAt).toLocaleString()}
          </p>
        </div>
        <Button onClick={onDone}>Take another quiz</Button>
      </div>
      <ol className="grid gap-4">
        {attempt.questions.map((question, index) => (
          <li key={`${question.topicId}/${question.id}`}>
            <GradedQuestion number={index + 1} question={question} />
          </li>
        ))}
      </ol>
    </div>
  );
}
