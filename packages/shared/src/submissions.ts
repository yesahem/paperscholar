/**
 * Submission vocabulary as plain constants, with no schema library, so browser
 * code can import it cheaply as `@repo/shared/submissions`. The zod schemas
 * built from it are in http/submissions.ts.
 */

/** `run`: public tests only. `submit`: public and hidden tests (docs/specs/07-runner.md §3). */
export const SUBMISSION_MODES = ["run", "submit"] as const;
export type SubmissionMode = (typeof SUBMISSION_MODES)[number];

/** Lifecycle of a submission (docs/specs/07-runner.md §3). */
export const SUBMISSION_STATUSES = ["queued", "running", "completed", "error"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Statuses of a submission still waiting for its verdict. */
export const IN_FLIGHT_STATUSES = [
  "queued",
  "running",
] as const satisfies readonly SubmissionStatus[];

/** The outcome of a finished submission (docs/specs/07-runner.md §7). */
export const VERDICTS = [
  "passed",
  "failed",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "import_violation",
  "runtime_error",
  "internal_error",
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Which test file a result came from. Hidden tests reveal only their name and message. */
export const TEST_GROUPS = ["public", "hidden"] as const;
export type TestGroup = (typeof TEST_GROUPS)[number];

export const TEST_STATUSES = ["passed", "failed", "error"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

/** A submission older than this that is still queued or running has lost its worker. */
export const STALE_SUBMISSION_SECONDS = 120;

/** Largest `code` accepted, in bytes of UTF-8 (docs/specs/05-api.md §6). */
export const MAX_CODE_BYTES = 64 * 1024;

/** Default and largest page size of `GET /v1/submissions` (docs/specs/05-api.md §4). */
export const SUBMISSION_PAGE_SIZE = { default: 20, max: 100 } as const;

/** Bytes of `text` in UTF-8, without allocating an encoded copy for ASCII-only text. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}
