"use client";

import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/cn";
import { Check, X } from "lucide-react";
import { Markdown } from "@/components/content/markdown";

export interface GradedQuestionData {
  prompt: string;
  options: string[];
  chosen: number | null;
  answer: number;
  correct: boolean;
  explanation: string;
}

/**
 * One graded multiple-choice question: the learner's choice and the right
 * answer, marked with icons and words (never colour alone), then why. Used by
 * quizzes and course exercises.
 */
export function GradedQuestion({
  number,
  question,
}: {
  number: number;
  question: GradedQuestionData;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Question {number}</p>
            <Markdown>{question.prompt}</Markdown>
          </div>
          <Badge variant={question.correct ? "success" : "destructive"}>
            {question.correct
              ? "Correct"
              : question.chosen === null
                ? "Unanswered"
                : "Wrong"}
          </Badge>
        </div>
        <ul className="grid gap-2">
          {question.options.map((option, optionIndex) => {
            const isAnswer = optionIndex === question.answer;
            const isChosen = optionIndex === question.chosen;
            return (
              <li
                key={optionIndex}
                className={cn(
                  "flex items-start gap-3 rounded-md border border-input px-3 py-2 text-sm",
                  isAnswer && "border-success",
                  isChosen && !isAnswer && "border-destructive",
                )}
              >
                {isAnswer ? (
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-success"
                  />
                ) : isChosen ? (
                  <X
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                ) : (
                  <span aria-hidden="true" className="size-4 shrink-0" />
                )}
                <Markdown inline className="min-w-0 flex-1">
                  {option}
                </Markdown>
                {isAnswer || isChosen ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {isAnswer && isChosen
                      ? "Your answer, correct"
                      : isAnswer
                        ? "Correct answer"
                        : "Your answer"}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="rounded-md bg-muted p-3 text-sm">
          <p className="mb-1 font-medium">Why</p>
          <Markdown>{question.explanation}</Markdown>
        </div>
      </CardContent>
    </Card>
  );
}
