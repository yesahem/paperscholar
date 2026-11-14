/// <reference path="./text-modules.d.ts" />
import {
  assertRunFiles,
  HARNESS_FILES,
  harnessError,
  parseHarnessResult,
  SandboxProviderError,
  type RunRequest,
  type RunResult,
  type SandboxProvider,
} from "@repo/runner";
import type { RunEnvironment } from "@repo/shared";
import bootstrapSource from "./bootstrap.py" with { type: "text" };

/** The runner's hard limit: the harness's wall clock plus this (docs/specs/07-runner.md §9). */
export const KILL_GRACE_SECONDS = 15;
/** Memory above the problem's limit for the interpreter, libraries and the tmpfs. */
export const MEMORY_HEADROOM_MB = 1024;
/** Processes per container: enough for pytest, low enough to stop a fork bomb. */
export const PIDS_LIMIT = 128;
/** The unprivileged user the sandbox image creates. */
export const SANDBOX_USER = "10001:10001";
const MAX_STDERR_CHARS = 2000;
/** Docker's own exit codes: the daemon, the command or the image failed, not the run. */
const DOCKER_FAILURE_CODES = new Set([125, 126, 127]);
/** The kernel killed the container's first process: it ran out of memory. */
const SIGKILL_EXIT = 137;

/** One process started by the sandbox; tests replace it. */
export interface SpawnedProcess {
  exited: Promise<number>;
  stdout: Promise<string>;
  stderr: Promise<string>;
}

export type Spawn = (command: string[], stdin: string | null) => SpawnedProcess;

export interface DockerSandboxOptions {
  docker: { bin: string; host: string | null; path: string };
  images: Record<RunEnvironment, string>;
  /** A sandboxed runtime such as `runsc`, or null for Docker's default. */
  runtime: string | null;
  cpus: number;
  /** Reports a container that could not be removed. */
  onCleanupError?: (error: unknown, container: string) => void;
  spawn?: Spawn;
}

function bunSpawn(env: Record<string, string>): Spawn {
  return (command, stdin) => {
    const child = Bun.spawn(command, {
      env,
      stdin: stdin === null ? "ignore" : new TextEncoder().encode(stdin),
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exited: child.exited,
      stdout: new Response(child.stdout).text(),
      stderr: new Response(child.stderr).text(),
    };
  };
}

/** A container name nobody can guess or collide with. */
export function containerName(runId: string): string {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `paperscholar-run-${runId.slice(0, 60)}-${suffix}`;
}

/**
 * `docker run` for one run, with every restriction of docs/specs/13-self-hosting.md §5:
 * no network, read-only root, small tmpfs working directory, memory, CPU and
 * process limits, no capabilities, no privilege escalation, a non-root user,
 * and removal afterwards.
 */
export function dockerRunArgs(
  request: RunRequest,
  name: string,
  { images, runtime, cpus }: Pick<DockerSandboxOptions, "images" | "runtime" | "cpus">,
): string[] {
  const memoryMb = request.spec.memoryLimitMb + MEMORY_HEADROOM_MB;
  return [
    "run",
    "--rm",
    "--interactive",
    "--name",
    name,
    "--label",
    "paperscholar.run=true",
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/work:rw,nosuid,nodev,size=64m,mode=1777",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1777",
    "--memory",
    `${memoryMb}m`,
    "--memory-swap",
    `${memoryMb}m`,
    "--cpus",
    String(cpus),
    "--pids-limit",
    String(PIDS_LIMIT),
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    SANDBOX_USER,
    "--ulimit",
    "nofile=256:256",
    "--ulimit",
    "core=0",
    "--workdir",
    "/work",
    "--log-driver",
    "none",
    ...(runtime ? ["--runtime", runtime] : []),
    images[request.environment],
    "python",
    "-I",
    "-c",
    bootstrapSource,
  ];
}

/** Separates the bootstrap's result from anything printed before it. */
export function readMarkedResult(stdout: string, marker: string): string | null {
  const line = `\n${marker}\n`;
  const at = stdout.lastIndexOf(line);
  return at === -1 ? null : stdout.slice(at + line.length);
}

/**
 * Runs each request in a fresh Docker container and destroys it afterwards.
 * Plain Docker shares the host kernel: suitable for people you trust; set a
 * sandboxed runtime such as gVisor for a public instance (docs/specs/13-self-hosting.md §5).
 */
export class DockerSandbox implements SandboxProvider {
  readonly name = "docker";
  private readonly options: DockerSandboxOptions;
  private readonly spawn: Spawn;
  private readonly onCleanupError: (error: unknown, container: string) => void;

  constructor(options: DockerSandboxOptions) {
    this.options = options;
    const env: Record<string, string> = { PATH: options.docker.path, HOME: "/tmp" };
    if (options.docker.host) env.DOCKER_HOST = options.docker.host;
    this.spawn = options.spawn ?? bunSpawn(env);
    this.onCleanupError = options.onCleanupError ?? (() => {});
  }

  /** Whether the daemon answers and both images exist; problems, for the start-up log. */
  async check(): Promise<string[]> {
    const problems: string[] = [];
    const version = this.spawn(
      [this.options.docker.bin, "version", "--format", "{{.Server.Version}}"],
      null,
    );
    if ((await version.exited) !== 0) {
      problems.push(
        `Docker is not reachable: ${(await version.stderr).trim().slice(0, 300)}`,
      );
      return problems;
    }
    for (const image of Object.values(this.options.images)) {
      const inspect = this.spawn(
        [this.options.docker.bin, "image", "inspect", "--format", "{{.Id}}", image],
        null,
      );
      if ((await inspect.exited) !== 0)
        problems.push(`Image ${image} is missing. Build it with bun run runner:images.`);
    }
    return problems;
  }

  async run(request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
    assertRunFiles(request.files);
    if (signal?.aborted)
      throw new SandboxProviderError(`Run ${request.runId}: cancelled.`, this.name);
    const started = performance.now();
    const name = containerName(request.runId);
    const marker = crypto.randomUUID().replaceAll("-", "");
    const payload = JSON.stringify({
      marker,
      files: [
        ...HARNESS_FILES,
        ...request.files,
        { path: "spec.json", content: JSON.stringify(request.spec) },
      ],
    });

    const docker = this.options.docker.bin;
    const child = this.spawn(
      [docker, ...dockerRunArgs(request, name, this.options)],
      payload,
    );
    let killedBy: "timeout" | "abort" | null = null;
    const kill = (reason: "timeout" | "abort") => {
      if (killedBy) return;
      killedBy = reason;
      // Killing the CLI would leave the container running; kill the container.
      void this.spawn([docker, "kill", name], null).exited;
    };
    const timer = setTimeout(
      () => kill("timeout"),
      (request.spec.wallClockLimitSeconds + KILL_GRACE_SECONDS) * 1000,
    );
    const onAbort = () => kill("abort");
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        child.stdout,
        child.stderr,
      ]);
      const elapsed = Math.round(performance.now() - started);
      if (killedBy === "abort") {
        throw new SandboxProviderError(`Run ${request.runId}: cancelled.`, this.name);
      }
      if (killedBy === "timeout") {
        return harnessError(
          "The run passed its hard time limit and was stopped.",
          elapsed,
        );
      }
      const result = readMarkedResult(stdout, marker);
      if (result !== null && result.trim() !== "")
        return parseHarnessResult(result, elapsed);
      if (DOCKER_FAILURE_CODES.has(exitCode)) {
        throw new SandboxProviderError(
          `Run ${request.runId}: docker failed (${exitCode}): ${stderr.trim().slice(-MAX_STDERR_CHARS)}`,
          this.name,
        );
      }
      if (exitCode === SIGKILL_EXIT) {
        return {
          outcome: "out_of_memory",
          tests: [],
          violations: [],
          errorOutput: null,
          durationMs: elapsed,
        };
      }
      return harnessError(
        `The sandbox exited with code ${exitCode} without a result.\n${stderr.slice(-MAX_STDERR_CHARS)}`,
        elapsed,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      // --rm normally removes it; this covers a CLI that died before Docker did.
      const remove = this.spawn([docker, "rm", "--force", name], null);
      const [code, removeErr] = await Promise.all([remove.exited, remove.stderr]);
      if (code !== 0 && !/no such container/i.test(removeErr)) {
        this.onCleanupError(new Error(removeErr.trim().slice(0, 300)), name);
      }
    }
  }
}
