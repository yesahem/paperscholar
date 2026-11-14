import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESS_FILES } from "../harness-files";
import {
  assertRunFiles,
  type RunRequest,
  type RunResult,
  type SandboxProvider,
} from "../types";
import { harnessError, parseHarnessResult } from "./result";

/** Extra time the provider allows beyond the harness's own wall clock before killing it. */
const KILL_GRACE_SECONDS = 15;
const MAX_STDERR_CHARS = 2000;

/** The interpreter created by `bun run runner:setup`, if it exists. */
export function defaultLocalPythonPath(): string {
  const venvPython = fileURLToPath(new URL("../../.venv/bin/python", import.meta.url));
  return existsSync(venvPython) ? venvPython : "python3";
}

export interface LocalProviderOptions {
  /** Interpreter with the environment's packages installed. */
  pythonPath: string;
  /** The process's NODE_ENV. The provider refuses to exist in production. */
  nodeEnv: string | undefined;
}

/**
 * Runs the harness as a subprocess on this machine. For development, tests and
 * content verification only: it is NOT a security boundary, so it refuses to
 * start in production (docs/specs/07-runner.md §8).
 */
export class LocalProvider implements SandboxProvider {
  readonly name = "local";
  private readonly pythonPath: string;

  constructor({ pythonPath, nodeEnv }: LocalProviderOptions) {
    if (nodeEnv === "production") {
      throw new Error(
        "The local runner provider is not a security boundary and cannot run in production.",
      );
    }
    this.pythonPath = pythonPath;
  }

  async run(request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
    assertRunFiles(request.files);
    const started = performance.now();
    const directory = await mkdtemp(join(tmpdir(), `runner-${request.runId}-`));

    try {
      for (const file of [...HARNESS_FILES, ...request.files]) {
        const path = join(directory, file.path);
        await mkdir(dirname(path), { recursive: true });
        await Bun.write(path, file.content);
      }
      await Bun.write(join(directory, "spec.json"), JSON.stringify(request.spec));

      // Only PATH reaches the harness: nothing secret from this process can leak in.
      const child = Bun.spawn([this.pythonPath, "harness.py"], {
        cwd: directory,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          LANG: "C.UTF-8",
          HOME: directory,
        },
        stdin: "ignore",
        stdout: "ignore",
        stderr: "pipe",
      });

      const kill = () => child.kill("SIGKILL");
      const timer = setTimeout(
        kill,
        (request.spec.wallClockLimitSeconds + KILL_GRACE_SECONDS) * 1000,
      );
      signal?.addEventListener("abort", kill, { once: true });
      const [exitCode, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);

      const elapsed = Math.round(performance.now() - started);
      if (signal?.aborted) return harnessError("The run was cancelled.", elapsed);

      const resultFile = Bun.file(join(directory, "result.json"));
      if (!(await resultFile.exists())) {
        return harnessError(
          `The harness exited with code ${exitCode} without a result.\n${stderr.slice(-MAX_STDERR_CHARS)}`,
          elapsed,
        );
      }

      return parseHarnessResult(await resultFile.text(), elapsed);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
