"use client";

import type { OpenExamAttempt } from "@repo/shared";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { RadioGroup } from "@repo/ui/components/radio-group";
import { Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DifficultyBadge } from "@/components/content/difficulty-badge";
import { Markdown } from "@/components/content/markdown";
import {
  AUTO_SUBMIT_MARGIN_MS,
  answersFor,
  formatRemaining,
  remainingMs,
} from "@/lib/exams/quiz";

/**
 * A running attempt: one card per question and a countdown. When time is
 * nearly up the page submits whatever has been chosen, since the server
 * refuses a submit after the deadline.
 */
export function QuizRunner({
  attempt,
  submitting,
  onSubmit,
}: {
  attempt: OpenExamAttempt;
  submitting: boolean;
  onSubmit: (answers: (number | null)[]) => void;
}) {
  const [choices, setChoices] = useState<Map<number, number>>(() => new Map());
  const [now, setNow] = useState(() => Date.now());
  const autoSubmitted = useRef(false);
  const left = remainingMs(attempt.expiresAt, now);
  const answered = choices.size;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (left > AUTO_SUBMIT_MARGIN_MS || autoSubmitted.current || submitting) return;
    autoSubmitted.current = true;
    onSubmit(answersFor(attempt.total, choices));
  }, [left, submitting, onSubmit, attempt.total, choices]);

  function choose(index: number, option: number) {
    setChoices((current) => new Map(current).set(index, option));
  }

  return (
    <div className="grid gap-6">
      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-4 py-3 backdrop-blur">
        <p className="text-sm">
          <span className="font-medium">
            {answered} of {attempt.total}
          </span>{" "}
          answered · {attempt.topics.map((topic) => topic.title).join(", ")}
        </p>
        <p
          className="flex items-center gap-1.5 font-mono text-sm tabular-nums"
          role="timer"
        >
          <Timer aria-hidden="true" className="size-4" />
          <span className="sr-only">Time left: </span>
          {formatRemaining(left)}
        </p>
      </div>
      <ol className="grid gap-4">
        {attempt.questions.map((question, index) => (
          <li key={`${question.topicId}/${question.id}`}>
            <Card>
              <CardContent className="grid gap-4">
                <div className="flex items-start justify-between gap-3">
                  <Markdown className="min-w-0">{question.prompt}</Markdown>
                  <DifficultyBadge difficulty={question.difficulty} />
                </div>
                <RadioGroup
                  legend={`Question ${index + 1}`}
                  options={question.options.map((label, option) => ({
                    value: String(option),
                    label: <Markdown inline>{label}</Markdown>,
                  }))}
                  value={choices.has(index) ? String(choices.get(index)) : null}
                  onValueChange={(value) => choose(index, Number(value))}
                  disabled={submitting}
                />
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={submitting}
          onClick={() => {
            autoSubmitted.current = true;
            onSubmit(answersFor(attempt.total, choices));
          }}
        >
          Submit answers
        </Button>
        {answered < attempt.total ? (
          <span className="text-sm text-muted-foreground">
            {attempt.total - answered} unanswered; they count as wrong.
          </span>
        ) : null}
      </div>
    </div>
  );
}
