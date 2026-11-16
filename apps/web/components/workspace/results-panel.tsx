"use client";

import type { Submission } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Meter } from "@repo/ui/components/meter";
import { Spinner } from "@repo/ui/components/spinner";
import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { VerificationBanner } from "@/components/auth/verification-banner";
import { formatDuration, humaniseTestName } from "@repo/web-core/results/format";
import { TestList } from "@repo/web-core/results/test-list";
import { timedOutTests, verdictHeadline } from "@/lib/submissions/describe";
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
