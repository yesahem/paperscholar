"use client";

import type { Submission, SubmissionMode } from "@repo/shared";
import { ERROR_MESSAGES } from "@repo/shared/errors";
import { useToast } from "@repo/ui/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { ApiError } from "@/lib/api/errors";
import { createSubmission, getSubmission } from "@/lib/api/submissions";
import { queryKeys } from "@/lib/queries";
import { retryWhen } from "@/lib/submissions/describe";
import { nextPollDelayMs } from "@/lib/submissions/polling";

/** The Run/Submit state machine (docs/specs/08-web.md §5.4). */
export type RunState =
  | { kind: "idle" }
  | { kind: "creating"; mode: SubmissionMode }
  | { kind: "polling"; mode: SubmissionMode; id: string; submission: Submission | null }
  | { kind: "finished"; mode: SubmissionMode; submission: Submission }
  | { kind: "timedOut"; mode: SubmissionMode; id: string }
  | { kind: "unverified" }
  | { kind: "failed"; mode: SubmissionMode; message: string };

export function isBusy(state: RunState): boolean {
  return state.kind === "creating" || state.kind === "polling";
}

function detail<T>(
  error: ApiError,
  key: string,
  guard: (value: unknown) => value is T,
): T | null {
  const details = error.details;
  if (typeof details !== "object" || details === null || !(key in details)) return null;
  const value = (details as Record<string, unknown>)[key];
  return guard(value) ? value : null;
}
const isString = (value: unknown): value is string => typeof value === "string";

export interface UseRunOptions {
  paperId: string;
  problemId: string;
  /** Whether a session exists; signed-out visitors get the sign-in modal straight away. */
  signedIn: boolean;
}

/**
 * Runs or submits code and follows the submission to its verdict. The latest
 * result stays on screen until the next run starts.
 */
export function useRun({ paperId, problemId, signedIn }: UseRunOptions) {
  const [state, setState] = useState<RunState>({ kind: "idle" });
  const previous = useRef<RunState>({ kind: "idle" });
  const poller = useRef<AbortController | null>(null);
  const authDialog = useAuthDialog();
  const toast = useToast();
  const queries = useQueryClient();

  useEffect(() => () => poller.current?.abort(), []);

  const finish = useCallback(
    (mode: SubmissionMode, submission: Submission) => {
      setState({ kind: "finished", mode, submission });
      void queries.invalidateQueries({
        queryKey: queryKeys.problemSubmissions(paperId, problemId),
      });
      // A solve updates solved marks, profiles and rankings (docs/specs/08-web.md §5.5).
      if (mode === "submit" && submission.verdict === "passed") {
        for (const queryKey of [queryKeys.progress, ["leaderboard"], ["profile"]]) {
          void queries.invalidateQueries({ queryKey });
        }
      }
    },
    [paperId, problemId, queries],
  );

  const poll = useCallback(
    (mode: SubmissionMode, id: string) => {
      poller.current?.abort();
      const controller = new AbortController();
      poller.current = controller;
      const started = Date.now();
      setState({ kind: "polling", mode, id, submission: null });

      const tick = async () => {
        if (controller.signal.aborted) return;
        try {
          const submission = await getSubmission(id, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (submission.status === "completed" || submission.status === "error") {
            finish(mode, submission);
            return;
          }
          setState({ kind: "polling", mode, id, submission });
        } catch (error) {
          if (controller.signal.aborted) return;
          // A dropped poll is retried; a definite answer from the API is not.
          if (error instanceof ApiError && error.status !== null && error.status < 500) {
            setState({ kind: "failed", mode, message: error.message });
            return;
          }
        }
        const delay = nextPollDelayMs(Date.now() - started);
        if (delay === null) setState({ kind: "timedOut", mode, id });
        else setTimeout(() => void tick(), delay);
      };
      setTimeout(() => void tick(), nextPollDelayMs(0) ?? 1000);
    },
    [finish],
  );

  const start = useCallback(
    async (mode: SubmissionMode, code: string) => {
      if (isBusy(state)) return;
      if (!signedIn) {
        authDialog.open();
        return;
      }
      previous.current = state;
      setState({ kind: "creating", mode });
      try {
        const created = await createSubmission({ paperId, problemId, code, mode });
        poll(mode, created.id);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          setState({ kind: "failed", mode, message: ERROR_MESSAGES.internal_error });
          return;
        }
        switch (error.code) {
          case "unauthenticated":
            setState(previous.current);
            authDialog.open();
            return;
          case "email_not_verified":
            setState({ kind: "unverified" });
            return;
          case "submission_in_progress": {
            const running = detail(error, "submissionId", isString);
            if (running) poll(mode, running);
            else setState({ kind: "failed", mode, message: error.message });
            return;
          }
          case "rate_limited":
          case "quota_exceeded":
            setState(previous.current);
            toast({
              title: error.message,
              description: `Try again ${retryWhen(error.retryAfterSeconds, detail(error, "resetsAt", isString))}.`,
              variant: "warning",
            });
            return;
          default:
            setState({ kind: "failed", mode, message: error.message });
        }
      }
    },
    [authDialog, paperId, poll, problemId, signedIn, state, toast],
  );

  /** Looks again at a run that took too long, without starting a new one. */
  const resume = useCallback(() => {
    if (state.kind === "timedOut") poll(state.mode, state.id);
  }, [poll, state]);

  return { state, start, resume };
}
