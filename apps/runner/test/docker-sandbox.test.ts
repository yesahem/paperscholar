import { buildRunRequest, SandboxProviderError } from "@repo/runner";
import { describe, expect, test } from "bun:test";
import { reluProblem, reluSolution, reluStarter } from "@repo/runner/testing";
import {
  containerName,
  DockerSandbox,
  dockerRunArgs,
  readMarkedResult,
  type Spawn,
  type SpawnedProcess,
} from "../src/docker-sandbox";

const images = { numpy: "sandbox-numpy", torch: "sandbox-torch" };
const request = buildRunRequest(reluProblem, {
  runId: "sub-1",
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

function finished(exitCode: number, stdout = "", stderr = ""): SpawnedProcess {
  return {
    exited: Promise.resolve(exitCode),
    stdout: Promise.resolve(stdout),
    stderr: Promise.resolve(stderr),
  };
}

/** A fake docker CLI: `run` answers with `respond`, everything else succeeds. */
function fakeDocker(
  respond: (stdin: string) => SpawnedProcess | Promise<SpawnedProcess>,
) {
  const calls: string[][] = [];
  const spawn: Spawn = (command, stdin) => {
    calls.push(command);
    if (command[1] === "run") {
      const answer = Promise.resolve(respond(stdin ?? ""));
      return {
        exited: answer.then((process) => process.exited),
        stdout: answer.then((process) => process.stdout),
        stderr: answer.then((process) => process.stderr),
      };
    }
    return finished(0);
  };
  const sandbox = new DockerSandbox({
    docker: { bin: "docker", host: null, path: "/usr/bin" },
    images,
    runtime: null,
    cpus: 1,
    spawn,
  });
  return { sandbox, calls };
}

describe("dockerRunArgs", () => {
  test("locks the container down as spec 13 §5 requires", () => {
    const args = dockerRunArgs(request, "paperscholar-run-x", {
      images,
      runtime: null,
      cpus: 1,
    });
    const joined = args.join(" ");
    for (const flag of [
      "--rm",
      "--network none",
      "--read-only",
      "--cap-drop ALL",
      "--security-opt no-new-privileges",
      "--user 10001:10001",
      "--pids-limit 128",
      "--memory 1280m",
      "--memory-swap 1280m",
      "--cpus 1",
    ]) {
      expect(joined).toContain(flag);
    }
    expect(args).toContain("sandbox-numpy");
    expect(args).not.toContain("--runtime");
    // No environment variable is passed in.
    expect(args).not.toContain("--env");
    expect(args).not.toContain("-e");
  });

  test("adds a sandboxed runtime when one is configured", () => {
    const args = dockerRunArgs(request, "n", { images, runtime: "runsc", cpus: 2 });
    expect(args.join(" ")).toContain("--runtime runsc");
  });

  test("container names carry the run id and an unguessable suffix", () => {
    expect(containerName("sub-1")).toMatch(/^paperscholar-run-sub-1-[0-9a-f]{12}$/);
    expect(containerName("sub-1")).not.toBe(containerName("sub-1"));
  });
});

describe("readMarkedResult", () => {
  test("takes only what follows the last marker line", () => {
    expect(readMarkedResult("noise\nabc\n{}", "abc")).toBe("{}");
    expect(readMarkedResult('\nabc\nfake\nabc\n{"x":1}', "abc")).toBe('{"x":1}');
    expect(readMarkedResult("no marker", "abc")).toBeNull();
  });
});

describe("DockerSandbox with a fake docker", () => {
  test("sends the files on stdin and parses the marked result", async () => {
    let payload: { marker: string; files: { path: string }[] } | null = null;
    const { sandbox, calls } = fakeDocker((stdin) => {
      payload = JSON.parse(stdin);
      return finished(0, `\n${payload?.marker}\n${resultJson}`);
    });
    expect((await sandbox.run(request)).outcome).toBe("completed");
    const paths = (payload as unknown as { files: { path: string }[] }).files.map(
      (file) => file.path,
    );
    expect(paths).toEqual([
      "harness.py",
      "conftest.py",
      "solution.py",
      "tests/test_public.py",
      "tests/test_hidden.py",
      "spec.json",
    ]);
    // The container is force-removed afterwards in any case.
    expect(calls.at(-1)?.slice(1, 3)).toEqual(["rm", "--force"]);
  });

  test("docker's own failures throw; a kernel kill is out of memory; anything else is our error", async () => {
    await expect(
      fakeDocker(() => finished(125, "", "no such image")).sandbox.run(request),
    ).rejects.toBeInstanceOf(SandboxProviderError);
    expect((await fakeDocker(() => finished(137)).sandbox.run(request)).outcome).toBe(
      "out_of_memory",
    );
    const missing = await fakeDocker(() => finished(3, "", "Traceback")).sandbox.run(
      request,
    );
    expect(missing.outcome).toBe("harness_error");
    expect(missing.errorOutput).toContain("Traceback");
  });

  test("cancelling kills the container and throws", async () => {
    const controller = new AbortController();
    let release: (process: SpawnedProcess) => void = () => {};
    const { sandbox, calls } = fakeDocker(
      () => new Promise((resolve) => (release = resolve)),
    );
    const running = sandbox.run(request, controller.signal);
    await Bun.sleep(5);
    controller.abort();
    release(finished(137));
    await expect(running).rejects.toThrow("cancelled");
    expect(calls.some((command) => command[1] === "kill")).toBe(true);
  });
});

const hasImage =
  Bun.which("docker") !== null &&
  Bun.spawnSync([
    "docker",
    "image",
    "inspect",
    images.numpy.replace("sandbox", "paperscholar-sandbox"),
  ]).exitCode === 0;

describe.if(hasImage)("DockerSandbox against Docker", () => {
  const sandbox = new DockerSandbox({
    docker: { bin: "docker", host: null, path: process.env.PATH ?? "/usr/bin:/bin" },
    images: { numpy: "paperscholar-sandbox-numpy", torch: "paperscholar-sandbox-torch" },
    runtime: null,
    cpus: 1,
  });

  test("the reference solution passes and the starter fails", async () => {
    const solution = await sandbox.run(request);
    expect(solution.outcome).toBe("completed");
    expect(solution.tests.map((test) => test.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    const starter = await sandbox.run(
      buildRunRequest(reluProblem, { runId: "sub-2", code: reluStarter, mode: "run" }),
    );
    expect(starter.tests.every((test) => test.status !== "passed")).toBe(true);
  }, 60_000);
});
