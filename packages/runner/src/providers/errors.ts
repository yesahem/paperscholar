/**
 * A provider could not produce a result: the sandbox service was unreachable,
 * refused the request, or the run was cancelled. The submission ends as
 * `internal_error` (docs/specs/07-runner.md §7). The message is for logs and
 * never contains credentials.
 */
export class SandboxProviderError extends Error {
  constructor(
    message: string,
    /** The provider's name, for logs. */
    readonly provider: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = "SandboxProviderError";
  }
}
