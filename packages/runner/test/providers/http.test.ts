import { describe, expect, test } from "bun:test";
import {
  buildRunRequest,
  HttpRunnerProvider,
  SandboxProviderError,
  type RunResult,
} from "../../src";
import { reluProblem, reluSolution } from "../fixtures";

const request = buildRunRequest(reluProblem, {
  runId: "sub-1",
  code: reluSolution,
  mode: "run",
});
const passed: RunResult = {
  outcome: "completed",
  tests: [
    {
      name: "test_x",
      group: "public",
      status: "passed",
      durationMs: 3,
      message: null,
      traceback: null,
      stdout: null,
      timedOut: false,
    },
  ],
  violations: [],
  errorOutput: null,
  durationMs: 40,
};

function provider(respond: (input: string, init: RequestInit) => Promise<Response>) {
  return new HttpRunnerProvider({
    url: "http://runner:8798/",
    token: "t".repeat(32),
    fetch: respond,
  });
}

describe("HttpRunnerProvider", () => {
  test("posts the request with the bearer token and returns the validated result", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const result = await provider(async (url, init) => {
      seen = { url, init };
      return Response.json(passed);
    }).run(request);
    expect(result).toEqual(passed);
    expect(seen).not.toBeNull();
    const { url, init } = seen as unknown as { url: string; init: RequestInit };
    expect(url).toBe("http://runner:8798/v1/runs");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Bearer ${"t".repeat(32)}`,
    );
    expect(JSON.parse(String(init.body))).toEqual(request);
  });

  test("a refusal, an unreachable service or a malformed result throws a provider error", async () => {
    const refused = provider(async () => new Response("unauthorised", { status: 401 }));
    await expect(refused.run(request)).rejects.toBeInstanceOf(SandboxProviderError);

    const unreachable = provider(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(unreachable.run(request)).rejects.toThrow("unreachable");

    const malformed = provider(async () => Response.json({ outcome: "passed" }));
    await expect(malformed.run(request)).rejects.toThrow("unexpected shape");
  });

  test("a cancelled run says so", async () => {
    const controller = new AbortController();
    const slow = provider(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const running = slow.run(request, controller.signal);
    controller.abort();
    await expect(running).rejects.toThrow("cancelled");
  });
});
