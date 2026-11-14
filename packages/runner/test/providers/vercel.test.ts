import { describe, expect, test } from "bun:test";
import {
  buildRunRequest,
  SandboxProviderError,
  vcpusFor,
  VercelSandboxProvider,
  type VercelSandboxCreateParams,
  type VercelSandboxHandle,
} from "../../src";
import { reluProblem, reluSolution } from "../fixtures";

const request = buildRunRequest(reluProblem, {
  runId: "sub-2",
  code: reluSolution,
  mode: "submit",
});
const resultJson = JSON.stringify({
  outcome: "completed",
  tests: [],
  violations: [],
  errorOutput: null,
  durationMs: 5,
});

interface Recorder {
  created: VercelSandboxCreateParams[];
  written: string[];
  commands: {
    cmd: string;
    args: string[];
    env: Record<string, string>;
    timeoutMs: number;
  }[];
  stopped: number;
}

function fakeSandbox(
  recorder: Recorder,
  behaviour: { result?: string | null; failCommand?: boolean; failStop?: boolean } = {},
): VercelSandboxHandle {
  return {
    async writeFiles(files) {
      recorder.written.push(...files.map((file) => file.path));
    },
    async runCommand(params) {
      if (behaviour.failCommand) throw new Error("vendor exploded");
      recorder.commands.push(params);
      return { exitCode: 0, stderr: async () => "trace" };
    },
    async readFileToBuffer() {
      const text = behaviour.result === undefined ? resultJson : behaviour.result;
      return text === null ? null : new TextEncoder().encode(text);
    },
    async stop() {
      recorder.stopped += 1;
      if (behaviour.failStop) throw new Error("stop failed");
    },
  };
}

function setup(behaviour: Parameters<typeof fakeSandbox>[1] = {}) {
  const recorder: Recorder = { created: [], written: [], commands: [], stopped: 0 };
  const cleanupErrors: string[] = [];
  const provider = new VercelSandboxProvider({
    images: { numpy: "sandbox-numpy:1", torch: "sandbox-torch:1" },
    credentials: null,
    onCleanupError: (_error, runId) => cleanupErrors.push(runId),
    createSandbox: async (params) => {
      recorder.created.push(params);
      return fakeSandbox(recorder, behaviour);
    },
  });
  return { provider, recorder, cleanupErrors };
}

describe("VercelSandboxProvider", () => {
  test("creates a sandbox from the environment's image, runs the harness and stops it", async () => {
    const { provider, recorder } = setup();
    const result = await provider.run(request);
    expect(result.outcome).toBe("completed");
    expect(recorder.created[0]).toMatchObject({
      image: "sandbox-numpy:1",
      timeout: 75_000,
      vcpus: 1,
    });
    expect(
      recorder.written.map((path) => path.replace("/vercel/sandbox/run/", "")),
    ).toEqual([
      "harness.py",
      "conftest.py",
      "solution.py",
      "tests/test_public.py",
      "tests/test_hidden.py",
      "spec.json",
    ]);
    expect(recorder.commands[0]).toMatchObject({
      cmd: "python",
      args: ["harness.py"],
      timeoutMs: 75_000,
    });
    // No variable of this process reaches the sandbox.
    expect(Object.keys(recorder.commands[0]?.env ?? {})).toEqual(["LANG"]);
    expect(recorder.stopped).toBe(1);
  });

  test("a missing or malformed result is our error, and the sandbox is still stopped", async () => {
    const missing = setup({ result: null });
    expect((await missing.provider.run(request)).outcome).toBe("harness_error");
    expect(missing.recorder.stopped).toBe(1);

    const malformed = setup({ result: "{not json" });
    expect((await malformed.provider.run(request)).errorOutput).toContain(
      "not valid JSON",
    );
  });

  test("a vendor failure throws a provider error after stopping the sandbox", async () => {
    const { provider, recorder } = setup({ failCommand: true });
    await expect(provider.run(request)).rejects.toBeInstanceOf(SandboxProviderError);
    expect(recorder.stopped).toBe(1);
  });

  test("a sandbox that cannot be stopped is reported, not hidden, and the result stands", async () => {
    const { provider, cleanupErrors } = setup({ failStop: true });
    expect((await provider.run(request)).outcome).toBe("completed");
    expect(cleanupErrors).toEqual(["sub-2"]);
  });

  test("memory decides the vCPUs: 2 GB each, with headroom", () => {
    expect(vcpusFor(256)).toBe(1);
    expect(vcpusFor(1024)).toBe(1);
    expect(vcpusFor(2048)).toBe(2);
  });
});
