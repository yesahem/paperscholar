import {
  buildRunRequest,
  SandboxProviderError,
  type RunResult,
  type SandboxProvider,
} from "@repo/runner";
import { reluProblem, reluSolution } from "@repo/runner/testing";
import { silentLogger } from "@repo/shared/logger";
import { describe, expect, test } from "bun:test";
import { createRunnerHandler } from "../src/server";

const token = "k".repeat(32);
const request = buildRunRequest(reluProblem, {
  runId: "sub-9",
  code: reluSolution,
  mode: "run",
});
const result: RunResult = {
  outcome: "completed",
  tests: [],
  violations: [],
  errorOutput: null,
  durationMs: 1,
};

function handler(run: SandboxProvider["run"] = async () => result) {
  return createRunnerHandler({
    token,
    sandbox: { name: "fake", run },
    logger: silentLogger,
    maxConcurrent: 1,
    maxQueue: 0,
  });
}

function post(body: unknown, authorization = `Bearer ${token}`) {
  return new Request("http://runner/v1/runs", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("runner service", () => {
  test("health answers without a token", async () => {
    const response = await handler()(new Request("http://runner/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  test("a valid request with the token gets the result", async () => {
    const response = await handler()(post(request));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  test("a missing or wrong token is refused before anything runs", async () => {
    let ran = false;
    const run = handler(async () => {
      ran = true;
      return result;
    });
    expect((await run(post(request, ""))).status).toBe(401);
    expect((await run(post(request, `Bearer ${"x".repeat(32)}`))).status).toBe(401);
    expect((await run(post(request, `Bearer ${token}x`))).status).toBe(401);
    expect(ran).toBe(false);
  });

  test("an invalid request is refused with its issues", async () => {
    const files = [...request.files, { path: "../escape.py", content: "" }];
    const response = await handler()(post({ ...request, files }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("files");
  });

  test("a busy runner answers 503; a sandbox failure 502", async () => {
    let release: () => void = () => {};
    const busy = handler(
      () => new Promise((resolve) => (release = () => resolve(result))),
    );
    const first = busy(post(request));
    await Bun.sleep(1);
    expect((await busy(post(request))).status).toBe(503);
    release();
    expect((await first).status).toBe(200);

    const failing = handler(async () => {
      throw new SandboxProviderError("docker failed", "docker");
    });
    const response = await failing(post(request));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "docker failed" });
  });

  test("unknown paths are 404", async () => {
    expect((await handler()(new Request("http://runner/v1/other"))).status).toBe(404);
  });
});
