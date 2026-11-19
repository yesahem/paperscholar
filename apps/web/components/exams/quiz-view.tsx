"use client";

import type { OpenExamAttempt, SubmittedExamAttempt } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ApiError } from "@repo/web-core/api/errors";
import { useMe } from "@repo/web-core/queries/session";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { getExamAttempt, startExamAttempt, submitExamAttempt } from "@/lib/api/exams";
import { queryKeys, useExamTopics } from "@/lib/queries";
import { AttemptHistory } from "./attempt-history";
import { QuizResult } from "./quiz-result";
import { QuizRunner } from "./quiz-runner";
import { QuizSetup } from "./quiz-setup";

type Phase =
  | { kind: "setup"; notice: string | null }
  | { kind: "running"; attempt: OpenExamAttempt }
  | { kind: "result"; attempt: SubmittedExamAttempt };

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Quiz mode (docs/specs/10-secondary-features.md §1): pick topics, answer
 * against the clock, see the server's grading with explanations.
 */
export function QuizView() {
  const me = useMe();
  const topics = useExamTopics();
  const dialog = useAuthDialog();
  const queries = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "setup", notice: null });
  const refreshHistory = useCallback(
    () => void queries.invalidateQueries({ queryKey: queryKeys.examAttempts }),
    [queries],
  );

  const start = useMutation({
    mutationFn: ({ chosen, count }: { chosen: string[]; count: number }) =>
      startExamAttempt({ topics: chosen, count }),
    onSuccess: (attempt) => {
      refreshHistory();
      setPhase({ kind: "running", attempt });
      window.scrollTo({ top: 0 });
    },
  });

  const submit = useMutation({
    mutationFn: ({ id, answers }: { id: string; answers: (number | null)[] }) =>
      submitExamAttempt(id, answers),
    onSuccess: (attempt) => {
      refreshHistory();
      setPhase({ kind: "result", attempt });
      window.scrollTo({ top: 0 });
    },
    onError: (error) => {
      refreshHistory();
      if (error instanceof ApiError && error.code === "conflict") {
        setPhase({ kind: "setup", notice: error.message });
      }
    },
  });

  const open = useMutation({
    mutationFn: (id: string) => getExamAttempt(id),
    onSuccess: (attempt) => {
      if (attempt.status === "submitted") setPhase({ kind: "result", attempt });
      else if (attempt.status === "in_progress") setPhase({ kind: "running", attempt });
      else setPhase({ kind: "setup", notice: "Time ran out on that quiz." });
      window.scrollTo({ top: 0 });
    },
  });

  const onSubmit = useCallback(
    (id: string, answers: (number | null)[]) => submit.mutate({ id, answers }),
    [submit],
  );

  if (topics.isPending || me.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }
  if (topics.isError) {
    return (
      <LoadError
        what="the quiz topics"
        message={topics.error.message}
        onRetry={() => void topics.refetch()}
        retrying={topics.isFetching}
      />
    );
  }
  if (topics.data.items.length === 0) {
    return (
      <EmptyState title="No quizzes on this site yet">
        Quiz topics appear here once the site&apos;s operator adds them to its content
        library.
      </EmptyState>
    );
  }

  if (phase.kind === "running") {
    const attempt = phase.attempt;
    return (
      <div className="grid gap-4">
        {submit.isError &&
        !(submit.error instanceof ApiError && submit.error.code === "conflict") ? (
          <Alert
            variant="destructive"
            title={messageOf(submit.error, "Could not send your answers. Try again.")}
          />
        ) : null}
        <QuizRunner
          key={attempt.id}
          attempt={attempt}
          submitting={submit.isPending}
          onSubmit={(answers) => onSubmit(attempt.id, answers)}
        />
      </div>
    );
  }
  if (phase.kind === "result") {
    return (
      <QuizResult
        attempt={phase.attempt}
        onDone={() => setPhase({ kind: "setup", notice: null })}
      />
    );
  }

  const signedIn = Boolean(me.data);
  return (
    <div className="grid gap-10">
      {phase.notice ? <Alert variant="info" title={phase.notice} /> : null}
      <QuizSetup
        topics={topics.data.items}
        signedIn={signedIn}
        starting={start.isPending}
        error={
          start.isError
            ? messageOf(start.error, "Could not start the quiz. Try again.")
            : null
        }
        onStart={(chosen, count) => start.mutate({ chosen, count })}
        onSignIn={() => dialog.open("sign-in")}
      />
      {signedIn ? (
        <section aria-labelledby="quiz-history" className="grid gap-3">
          <h2 id="quiz-history" className="text-lg font-semibold">
            Your quizzes
          </h2>
          {open.isError ? (
            <Alert
              variant="destructive"
              title={messageOf(open.error, "Could not open that quiz.")}
            />
          ) : null}
          <AttemptHistory
            opening={open.isPending ? (open.variables ?? null) : null}
            onOpen={(id) => open.mutate(id)}
          />
        </section>
      ) : null}
    </div>
  );
}
