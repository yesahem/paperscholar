import {
  runRequestSchema,
  SandboxProviderError,
  type SandboxProvider,
} from "@repo/runner";
import type { Logger } from "@repo/shared/logger";
import { timingSafeEqual } from "node:crypto";
import { QueueFullError, Semaphore } from "./semaphore";

/** Largest request body: a few files of at most 1 MB each. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface RunnerServerOptions {
  token: string;
  sandbox: SandboxProvider;
  logger: Logger;
  maxConcurrent: number;
  maxQueue: number;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorised(header: string | null, token: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The runner service's HTTP surface: `GET /health` and `POST /v1/runs`, which
 * takes a `RunRequest` and answers with its `RunResult`. Reachable only from
 * the backend and worker, and only with the shared token.
 */
export function createRunnerHandler({
  token,
  sandbox,
  logger,
  maxConcurrent,
  maxQueue,
}: RunnerServerOptions): (request: Request) => Promise<Response> {
  const slots = new Semaphore(maxConcurrent, maxQueue);

  return async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/health" && request.method === "GET") {
      return json({ ok: true, running: slots.running, queued: slots.queued });
    }
    if (pathname !== "/v1/runs") return json({ error: "Not found." }, 404);
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    if (!authorised(request.headers.get("Authorization"), token)) {
      return json({ error: "Unauthorised." }, 401);
    }

    const length = Number(request.headers.get("Content-Length") ?? 0);
    if (length > MAX_BODY_BYTES) return json({ error: "Too large." }, 413);
    const parsed = runRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return json(
        {
          error: "Invalid run request.",
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        },
        400,
      );
    }

    const run = parsed.data;
    const log = logger.child({ runId: run.runId, environment: run.environment });
    try {
      const result = await slots.use(
        () => sandbox.run(run, request.signal),
        request.signal,
      );
      log.info("run finished", {
        outcome: result.outcome,
        tests: result.tests.length,
        durationMs: result.durationMs,
      });
      return json(result);
    } catch (error) {
      if (error instanceof QueueFullError) {
        log.warn("run refused: queue full", {
          running: slots.running,
          queued: slots.queued,
        });
        return json({ error: error.message }, 503);
      }
      if (request.signal.aborted) {
        log.info("run cancelled by the caller");
        return json({ error: "Cancelled." }, 499);
      }
      log.error("run failed", { error });
      const message =
        error instanceof SandboxProviderError ? error.message : "The sandbox failed.";
      return json({ error: message }, 502);
    }
  };
}
