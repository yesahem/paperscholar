import type { RunEnvironment } from "@repo/shared";
import { HARNESS_FILES } from "../harness-files";
import {
  assertRunFiles,
  type RunRequest,
  type RunResult,
  type SandboxProvider,
} from "../types";
import { SandboxProviderError } from "./errors";
import { harnessError, parseHarnessResult } from "./result";

/** The vendor's hard limit on one sandbox: the harness's wall clock plus this (docs/specs/07-runner.md §9). */
const VENDOR_GRACE_SECONDS = 15;
/** Each vCPU brings this much memory (Vercel Sandbox). */
const MEMORY_PER_VCPU_MB = 2048;
/** Room for the interpreter and libraries above the problem's own limit. */
const MEMORY_HEADROOM_MB = 1024;
const MAX_VCPUS = 8;
const MAX_STDERR_CHARS = 2000;
/** Inside the sandbox; the SDK writes relative paths under /vercel/sandbox. */
const WORKDIR = "/vercel/sandbox/run";

/** The part of a Vercel sandbox this provider uses; tests replace it. */
export interface VercelSandboxHandle {
  writeFiles(
    files: { path: string; content: string }[],
    opts?: { signal?: AbortSignal },
  ): Promise<void>;
  runCommand(params: {
    cmd: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs: number;
  }): Promise<{ exitCode: number; stderr(): Promise<string> }>;
  readFileToBuffer(
    file: { path: string; cwd: string },
    opts?: { signal?: AbortSignal },
  ): Promise<Uint8Array | null>;
  stop(): Promise<unknown>;
}

export interface VercelSandboxCreateParams {
  image: string;
  /** Milliseconds before the vendor ends the sandbox regardless of what runs in it. */
  timeout: number;
  vcpus: number;
  signal?: AbortSignal;
}

export interface VercelSandboxCredentials {
  teamId: string;
  projectId: string;
  token: string;
}

export interface VercelSandboxProviderOptions {
  /** Image per environment, pushed to the Vercel Container Registry (docs/specs/07-runner.md §8). */
  images: Record<RunEnvironment, string>;
  /** Access-token credentials; null uses the deployment's OIDC token. */
  credentials: VercelSandboxCredentials | null;
  /** Reports a sandbox that could not be stopped. It still ends at its vendor timeout. */
  onCleanupError?: (error: unknown, runId: string) => void;
  /** Creates the sandbox. Defaults to the Vercel SDK. */
  createSandbox?: (params: VercelSandboxCreateParams) => Promise<VercelSandboxHandle>;
}

/** vCPUs needed for the memory a run may use (2 GB each). */
export function vcpusFor(memoryLimitMb: number): number {
  return Math.min(
    MAX_VCPUS,
    Math.max(1, Math.ceil((memoryLimitMb + MEMORY_HEADROOM_MB) / MEMORY_PER_VCPU_MB)),
  );
}

function sdkFactory(
  credentials: VercelSandboxCredentials | null,
): (params: VercelSandboxCreateParams) => Promise<VercelSandboxHandle> {
  return async ({ image, timeout, vcpus, signal }) => {
    // Loaded on first use, so instances on other providers never load the SDK.
    const { Sandbox } = await import("@vercel/sandbox");
    const sandbox = await Sandbox.create({
      image,
      timeout,
      resources: { vcpus },
      // Hard requirements for code from strangers (docs/specs/07-runner.md §8).
      networkPolicy: "deny-all",
      persistent: false,
      env: {},
      signal,
      ...(credentials ?? {}),
    });
    return {
      writeFiles: (files, opts) => sandbox.writeFiles(files, opts),
      runCommand: (params) => sandbox.runCommand(params),
      readFileToBuffer: (file, opts) => sandbox.readFileToBuffer(file, opts),
      stop: () => sandbox.stop(),
    };
  };
}

/**
 * The hosted default (docs/specs/07-runner.md §8): one Firecracker microVM per
 * run, from a prebuilt image, with outbound network denied and nothing
 * persisted. The sandbox is stopped in a `finally` block; if that fails, the
 * vendor's own timeout ends it.
 */
export class VercelSandboxProvider implements SandboxProvider {
  readonly name = "vercel";
  private readonly images: Record<RunEnvironment, string>;
  private readonly createSandbox: (
    params: VercelSandboxCreateParams,
  ) => Promise<VercelSandboxHandle>;
  private readonly onCleanupError: (error: unknown, runId: string) => void;

  constructor({
    images,
    credentials,
    onCleanupError = () => {},
    createSandbox = sdkFactory(credentials),
  }: VercelSandboxProviderOptions) {
    this.images = images;
    this.createSandbox = createSandbox;
    this.onCleanupError = onCleanupError;
  }

  async run(request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
    assertRunFiles(request.files);
    const started = performance.now();
    const limitMs = (request.spec.wallClockLimitSeconds + VENDOR_GRACE_SECONDS) * 1000;

    let sandbox: VercelSandboxHandle;
    try {
      sandbox = await this.createSandbox({
        image: this.images[request.environment],
        timeout: limitMs,
        vcpus: vcpusFor(request.spec.memoryLimitMb),
        signal,
      });
    } catch (error) {
      throw new SandboxProviderError(
        `Run ${request.runId}: could not create a sandbox.`,
        this.name,
        { cause: error },
      );
    }

    try {
      await sandbox.writeFiles(
        [
          ...HARNESS_FILES,
          ...request.files,
          { path: "spec.json", content: JSON.stringify(request.spec) },
        ].map((file) => ({ path: `${WORKDIR}/${file.path}`, content: file.content })),
        { signal },
      );
      const finished = await sandbox.runCommand({
        cmd: "python",
        args: ["harness.py"],
        cwd: WORKDIR,
        // Nothing from this process reaches the sandbox.
        env: { LANG: "C.UTF-8" },
        signal,
        timeoutMs: limitMs,
      });
      const elapsed = Math.round(performance.now() - started);
      const result = await sandbox.readFileToBuffer(
        { path: "result.json", cwd: WORKDIR },
        { signal },
      );
      if (result === null) {
        const stderr = (await finished.stderr().catch(() => "")).slice(-MAX_STDERR_CHARS);
        return harnessError(
          `The harness exited with code ${finished.exitCode} without a result.\n${stderr}`,
          elapsed,
        );
      }
      return parseHarnessResult(new TextDecoder().decode(result), elapsed);
    } catch (error) {
      if (error instanceof SandboxProviderError) throw error;
      throw new SandboxProviderError(
        `Run ${request.runId}: ${signal?.aborted ? "the run was cancelled" : "the sandbox failed"}.`,
        this.name,
        { cause: error },
      );
    } finally {
      await sandbox
        .stop()
        .catch((error: unknown) => this.onCleanupError(error, request.runId));
    }
  }
}
