"use client";

import type { Submission, SubmissionTest } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Meter } from "@repo/ui/components/meter";
import { Spinner } from "@repo/ui/components/spinner";
import { ArrowRight, CircleCheck, CircleX, Clock, EyeOff, RotateCcw } from "lucide-react";
import Link from "next/link";
import { VerificationBanner } from "@/components/auth/verification-banner";
import { humaniseTestName } from "@/lib/content/format";
import {
  formatDuration,
  timedOutTests,
  verdictHeadline,
} from "@/lib/submissions/describe";
import type { RunState } from "./use-run";

export interface ResultsPanelProps {
  state: RunState;
  /** Packages the problem allows, shown with an import violation. */
  allowedPackages: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  /** The next step, linked after a solved submit; null on the last one. */
  next: { href: string; title: string } | null;
  onRetry: () => void;
  onResume: () => void;
}

/** The Results tab (docs/specs/08-web.md §5.5). */
export function ResultsPanel(props: ResultsPanelProps) {
  const { state } = props;
  return (
    <div
      className="flex flex-col gap-4 p-4 sm:p-6"
      aria-live="polite"
      aria-busy={state.kind === "creating" || state.kind === "polling"}
    >
      <ResultsBody {...props} />
    </div>
  );
}

function ResultsBody({ state, onRetry, onResume, ...problem }: ResultsPanelProps) {
  switch (state.kind) {
    case "idle":
      return (
        <p className="text-sm text-muted-foreground">
          Run your code against the public tests, or submit it against every test. Results
          appear here. <kbd className="font-mono">Ctrl/⌘ + Enter</kbd> runs;{" "}
          <kbd className="font-mono">Ctrl/⌘ + Shift + Enter</kbd> submits.
        </p>
      );
    case "creating":
      return <Spinner label="Queued…" />;
    case "polling":
      return (
        <Spinner
          label={state.submission?.status === "running" ? "Running tests…" : "Queued…"}
        />
      );
    case "unverified":
      return (
        <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
          <VerificationBanner />
        </div>
      );
    case "timedOut":
      return (
        <Alert variant="warning" title="This is taking too long">
          <span className="flex flex-wrap items-center gap-2">
            The run has not finished after two minutes.
            <Button size="sm" variant="outline" onClick={onResume}>
              <RotateCcw aria-hidden="true" />
              Check again
            </Button>
          </span>
        </Alert>
      );
    case "failed":
      return (
        <Alert variant="destructive" title="The run could not start">
          <span className="flex flex-wrap items-center gap-2">
            {state.message}
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          </span>
        </Alert>
      );
    case "finished":
      return (
        <FinishedResult
          submission={state.submission}
          submitted={state.mode === "submit"}
          onRetry={onRetry}
          {...problem}
        />
      );
  }
}

function FinishedResult({
  submission,
  submitted,
  allowedPackages,
  timeLimitSeconds,
  memoryLimitMb,
  next,
  onRetry,
}: Omit<ResultsPanelProps, "state" | "onResume"> & {
  submission: Submission;
  submitted: boolean;
}) {
  const headline = verdictHeadline(submission);
  const duration = formatDuration(submission.durationMs);
  const tests = submission.tests ?? [];

  switch (submission.verdict) {
    case "passed":
      return (
        <>
          <Alert variant="success" title={submitted ? "Solved" : headline}>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {submitted
                ? `${headline}, public and hidden.`
                : "Every public test passed. Submit to run the hidden tests too."}
              {duration ? (
                <span className="text-muted-foreground">{duration}</span>
              ) : null}
              {submitted && next ? (
                <Link
                  href={next.href}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  Next: {next.title}
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : null}
            </span>
          </Alert>
          <TestList tests={tests} />
        </>
      );
    case "failed":
      return (
        <>
          <Alert variant="destructive" title={headline}>
            <span className="flex flex-col gap-2">
              <Meter
                value={submission.testsPassed ?? 0}
                max={submission.testsTotal ?? 0}
                label="Tests passed"
                tone="destructive"
              />
              {duration ? (
                <span className="text-muted-foreground">{duration}</span>
              ) : null}
            </span>
          </Alert>
          <TestList tests={tests} />
        </>
      );
    case "time_limit_exceeded": {
      const slow = timedOutTests(submission);
      return (
        <>
          <Alert variant="destructive" title={headline}>
            {slow
              ? `${slow.map(humaniseTestName).join(", ")} took longer than the ${timeLimitSeconds} s limit per test.`
              : "The whole run took longer than the 60 s limit, often an endless loop."}
          </Alert>
          <TestList tests={tests} />
        </>
      );
    }
    case "memory_limit_exceeded":
      return (
        <Alert variant="destructive" title={headline}>
          Your code used more than the {memoryLimitMb} MB this problem allows.
        </Alert>
      );
    case "import_violation":
      return (
        <Alert variant="destructive" title={headline}>
          <span className="flex flex-col gap-1">
            <span>
              Not allowed here:{" "}
              <code className="font-mono">
                {(submission.violations ?? []).join(", ")}
              </code>
            </span>
            <span className="text-muted-foreground">
              Allowed: the standard library (except modules such as os and sys)
              {allowedPackages.length > 0 ? `, ${allowedPackages.join(", ")}` : ""}.
            </span>
          </span>
        </Alert>
      );
    case "runtime_error":
      return (
        <>
          <Alert variant="destructive" title={headline}>
            Fix this error, then run again.
          </Alert>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {submission.errorOutput ?? "No error text was reported."}
          </pre>
        </>
      );
    case "internal_error":
    case null:
      return (
        <Alert variant="destructive" title="Something went wrong on our side">
          <span className="flex flex-wrap items-center gap-2">
            This run was not counted.
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          </span>
        </Alert>
      );
  }
}

function TestList({ tests }: { tests: SubmissionTest[] }) {
  if (tests.length === 0) return null;
  return (
    <ul
      aria-label="Tests"
      className="flex flex-col divide-y divide-border rounded-lg border border-border"
    >
      {tests.map((test) => (
        <li key={`${test.group}:${test.name}`}>
          <TestRow test={test} />
        </li>
      ))}
    </ul>
  );
}

function TestRow({ test }: { test: SubmissionTest }) {
  const passed = test.status === "passed";
  const timedOut = test.message?.startsWith("Time limit exceeded") ?? false;
  const Icon = passed ? CircleCheck : timedOut ? Clock : CircleX;
  const summary = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Icon
        aria-hidden="true"
        className={
          passed ? "size-4 shrink-0 text-success" : "size-4 shrink-0 text-destructive"
        }
      />
      <span className="sr-only">{passed ? "Passed:" : "Failed:"}</span>
      <span className="min-w-0 flex-1 truncate">{humaniseTestName(test.name)}</span>
      {test.group === "hidden" ? (
        <Badge variant="outline">
          <EyeOff aria-hidden="true" />
          hidden
        </Badge>
      ) : null}
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatDuration(test.durationMs)}
      </span>
    </span>
  );

  if (passed || (!test.message && !test.traceback && !test.stdout)) {
    return <div className="flex items-center px-3 py-2 text-sm">{summary}</div>;
  }
  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer items-center px-3 py-2 hover:bg-accent">
        {summary}
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {test.message ? (
          <p className="font-mono text-xs whitespace-pre-wrap">{test.message}</p>
        ) : null}
        {test.traceback ? (
          <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
            {test.traceback}
          </pre>
        ) : null}
        {test.stdout ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Printed output</p>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
              {test.stdout}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}
