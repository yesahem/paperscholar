import type { Submission, Verdict } from "@repo/shared";

/** One-line headline for a finished submission (docs/specs/08-web.md §5.5). */
export function verdictHeadline(
  submission: Pick<Submission, "verdict" | "testsPassed" | "testsTotal">,
): string {
  const passed = submission.testsPassed ?? 0;
  const total = submission.testsTotal ?? 0;
  switch (submission.verdict) {
    case "passed":
      return `${total}/${total} tests passed`;
    case "failed":
      return `${passed}/${total} tests passed`;
    case "time_limit_exceeded":
      return "Time limit exceeded";
    case "memory_limit_exceeded":
      return "Memory limit exceeded";
    case "import_violation":
      return "Import not allowed";
    case "runtime_error":
      return "Your code did not load";
    case "internal_error":
      return "Something went wrong on our side";
    case null:
      return "Not finished";
  }
}

/** Short label for history rows. */
export const VERDICT_LABELS: Record<Verdict, string> = {
  passed: "Passed",
  failed: "Failed",
  time_limit_exceeded: "Time limit",
  memory_limit_exceeded: "Memory limit",
  import_violation: "Import not allowed",
  runtime_error: "Runtime error",
  internal_error: "Our error",
};

/**
 * Which tests hit their own time limit, or null when the whole run did
 * (docs/specs/08-web.md §5.5: "which test or the whole run").
 */
export function timedOutTests(submission: Pick<Submission, "tests">): string[] | null {
  const names = (submission.tests ?? [])
    .filter(
      (test) =>
        test.status !== "passed" && test.message?.startsWith("Time limit exceeded"),
    )
    .map((test) => test.name);
  return names.length > 0 ? names : null;
}

/** "1.2 s", "340 ms". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** "in 42 seconds", "in 3 minutes", "at 00:00 UTC" for a reset time. */
export function retryWhen(
  retryAfterSeconds: number | null,
  resetsAt: string | null,
): string {
  if (resetsAt) {
    const date = new Date(resetsAt);
    if (!Number.isNaN(date.getTime())) {
      return `after ${date.toISOString().slice(11, 16)} UTC`;
    }
  }
  if (retryAfterSeconds === null) return "shortly";
  if (retryAfterSeconds < 90) return `in ${retryAfterSeconds} seconds`;
  return `in ${Math.ceil(retryAfterSeconds / 60)} minutes`;
}
