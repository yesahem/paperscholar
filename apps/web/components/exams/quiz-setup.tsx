"use client";

import type { ExamTopic } from "@repo/shared";
import {
  EXAM_MAX_TOPICS,
  EXAM_QUESTION_COUNT,
  examDurationSeconds,
} from "@repo/shared/exams";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Field } from "@repo/ui/components/field";
import { Select } from "@repo/ui/components/select";
import { useState, type FormEvent } from "react";
import { QUESTION_COUNT_CHOICES } from "@/lib/exams/quiz";

/**
 * Choosing topics and a length. Signed-out visitors see the topics and a
 * sign-in action instead of the start button (docs/specs/08-web.md §8).
 */
export function QuizSetup({
  topics,
  signedIn,
  starting,
  error,
  onStart,
  onSignIn,
}: {
  topics: readonly ExamTopic[];
  signedIn: boolean;
  starting: boolean;
  error: string | null;
  onStart: (topics: string[], count: number) => void;
  onSignIn: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [count, setCount] = useState<number>(EXAM_QUESTION_COUNT.default);
  const [touched, setTouched] = useState(false);
  const available = topics
    .filter((topic) => chosen.includes(topic.id))
    .reduce((sum, topic) => sum + topic.questionCount, 0);
  const served = Math.min(count, available);
  const minutes = Math.round(examDurationSeconds(served) / 60);
  const noTopic = touched && chosen.length === 0;

  function toggle(id: string, on: boolean) {
    setChosen((current) =>
      on
        ? [...current, id].slice(0, EXAM_MAX_TOPICS)
        : current.filter((topic) => topic !== id),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (chosen.length > 0) onStart(chosen, count);
  }

  return (
    <form className="grid gap-6" onSubmit={submit} noValidate>
      {error ? <Alert variant="destructive" title={error} /> : null}
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Topics</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {topics.map((topic) => (
            <Checkbox
              key={topic.id}
              id={`topic-${topic.id}`}
              label={topic.title}
              description={`${topic.questionCount} question${topic.questionCount === 1 ? "" : "s"}`}
              checked={chosen.includes(topic.id)}
              disabled={!chosen.includes(topic.id) && chosen.length >= EXAM_MAX_TOPICS}
              onChange={(event) => toggle(topic.id, event.target.checked)}
              className="rounded-md border border-border p-3"
            />
          ))}
        </div>
        {noTopic ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            Choose at least one topic.
          </p>
        ) : null}
      </fieldset>
      <Field
        label="Questions"
        description={
          chosen.length > 0
            ? `${served} question${served === 1 ? "" : "s"}, ${minutes} minutes. Unanswered questions count as wrong.`
            : "You get 90 seconds a question, and at least ten minutes."
        }
        className="max-w-xs"
      >
        <Select
          value={String(count)}
          onChange={(event) => setCount(Number(event.target.value))}
        >
          {QUESTION_COUNT_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        {signedIn ? (
          <Button type="submit" loading={starting}>
            Start the quiz
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onSignIn}>
              Sign in to take a quiz
            </Button>
            <span className="text-sm text-muted-foreground">
              Quizzes are graded on the server and kept in your history.
            </span>
          </div>
        )}
      </div>
    </form>
  );
}
