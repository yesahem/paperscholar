import {
  runResultSchema,
  type RunRequest,
  type RunResult,
  type SandboxProvider,
} from "../types";
import { SandboxProviderError } from "./errors";

/** Extra time allowed beyond the harness's wall clock before the call gives up. */
const CLIENT_GRACE_SECONDS = 30;

export interface HttpRunnerProviderOptions {
  /** Base URL of the bundled runner service, e.g. `http://runner:8798`. */
  url: string;
  /** Shared secret the service requires as a bearer token. */
  token: string;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
}

/**
 * Sends each run to the bundled runner service (`apps/runner`), which starts
 * one locked-down Docker container per run (docs/specs/13-self-hosting.md §5).
 */
export class HttpRunnerProvider implements SandboxProvider {
  readonly name = "http";
  private readonly endpoint: string;
  private readonly token: string;
  private readonly fetchImpl: (input: string, init: RequestInit) => Promise<Response>;

  constructor({ url, token, fetch: fetchImpl = fetch }: HttpRunnerProviderOptions) {
    this.endpoint = `${url.replace(/\/+$/, "")}/v1/runs`;
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async run(request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
    const timeout = AbortSignal.timeout(
      (request.spec.wallClockLimitSeconds + CLIENT_GRACE_SECONDS) * 1000,
    );
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: combined,
      });
    } catch (error) {
      const reason = combined.aborted
        ? signal?.aborted
          ? "the run was cancelled"
          : "the runner service did not answer in time"
        : "the runner service is unreachable";
      throw new SandboxProviderError(`Run ${request.runId}: ${reason}.`, this.name, {
        cause: error,
      });
    }

    if (!response.ok) {
      // The service's error text is ours, not the learner's, and goes only to logs.
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new SandboxProviderError(
        `Run ${request.runId}: the runner service answered ${response.status}. ${detail}`.trim(),
        this.name,
      );
    }

    const parsed = runResultSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new SandboxProviderError(
        `Run ${request.runId}: the runner service sent a result in an unexpected shape.`,
        this.name,
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }
}
