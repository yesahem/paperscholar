"use client";

import type { ExerciseResult } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { RadioGroup } from "@repo/ui/components/radio-group";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ApiError } from "@repo/web-core/api/errors";
import { LoadError } from "@repo/web-core/states/load-error";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Markdown } from "@/components/content/markdown";
import { GradedQuestion } from "@/components/exams/graded-question";
import { submitExercise } from "@/lib/api/courses";
import { answersFor, scoreSummary } from "@/lib/exams/quiz";
import { useExercise } from "@/lib/queries";

/**
 * A course exercise: answer, submit, see each answer explained. Graded on
 * the server; submitting completes the item, and it can be tried again.
 */
export function ExerciseView({
  courseId,
  itemId,
  bestScore,
  onGraded,
}: {
  courseId: string;
  itemId: string;
  /** The best earlier score, if the exercise was submitted before. */
  bestScore: number | null;
  onGraded: () => void;
}) {
  const exercise = useExercise(courseId, itemId);
  const [choices, setChoices] = useState<Map<number, number>>(() => new Map());
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const submit = useMutation({
    mutationFn: (answers: (number | null)[]) => submitExercise(courseId, itemId, answers),
    onSuccess: (graded) => {
      setResult(graded);
      onGraded();
    },
  });

  if (exercise.isPending) return <Skeleton className="h-64 w-full" />;
  if (exercise.isError) {
    return (
      <LoadError
        what="this exercise"
        message={exercise.error.message}
        onRetry={() => void exercise.refetch()}
        retrying={exercise.isFetching}
      />
    );
  }

  if (result) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <p className="font-semibold">
            Score: {scoreSummary(result.score, result.total)}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setChoices(new Map());
            }}
          >
            Try again
          </Button>
        </div>
        <ol className="grid gap-4">
          {result.questions.map((question, index) => (
            <li key={question.id}>
              <GradedQuestion number={index + 1} question={question} />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const questions = exercise.data.questions;
  return (
    <div className="grid gap-4">
      {bestScore !== null ? (
        <p className="text-sm text-muted-foreground">
          Your best so far: {scoreSummary(bestScore, questions.length)}.
        </p>
      ) : null}
      {submit.isError ? (
        <Alert
          variant="destructive"
          title={
            submit.error instanceof ApiError
              ? submit.error.message
              : "Could not send your answers. Try again."
          }
        />
      ) : null}
      <ol className="grid gap-4">
        {questions.map((question, index) => (
          <li key={question.id}>
            <Card>
              <CardContent className="grid gap-4">
                <Markdown>{question.prompt}</Markdown>
                <RadioGroup
                  legend={`Question ${index + 1}`}
                  options={question.options.map((label, option) => ({
                    value: String(option),
                    label: <Markdown inline>{label}</Markdown>,
                  }))}
                  value={choices.has(index) ? String(choices.get(index)) : null}
                  onValueChange={(value) =>
                    setChoices((current) => new Map(current).set(index, Number(value)))
                  }
                  disabled={submit.isPending}
                />
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <div>
        <Button
          loading={submit.isPending}
          onClick={() => submit.mutate(answersFor(questions.length, choices))}
        >
          Check answers
        </Button>
      </div>
    </div>
  );
}
