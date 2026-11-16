"use client";

import type { SubmissionTest } from "@repo/shared";
import { Badge } from "@repo/ui/components/badge";
import { CircleCheck, CircleX, Clock, EyeOff } from "lucide-react";
import { formatDuration, humaniseTestName } from "./format";

/** Each test's outcome, failures expanded: also the review screen's view of a reference run. */
export function TestList({ tests }: { tests: SubmissionTest[] }) {
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
