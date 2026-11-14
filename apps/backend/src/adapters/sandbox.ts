import {
  defaultLocalPythonPath,
  HttpRunnerProvider,
  LocalProvider,
  VercelSandboxProvider,
  type SandboxProvider,
} from "@repo/runner";
import type { Logger } from "@repo/shared/logger";
import type { AppConfig } from "../env";

/**
 * The sandbox this instance runs learners' code in (docs/specs/07-runner.md §8).
 * `local` isolates nothing and exists for development; configuration refuses it
 * in production, and the provider itself refuses to start there too.
 */
export function createSandboxProvider(
  config: Pick<AppConfig, "runner" | "env">,
  logger: Logger,
): SandboxProvider {
  const runner = config.runner;
  switch (runner.provider) {
    case "local":
      return new LocalProvider({
        pythonPath: runner.pythonPath ?? defaultLocalPythonPath(),
        nodeEnv: config.env,
      });
    case "http":
      return new HttpRunnerProvider({ url: runner.url, token: runner.token });
    case "vercel":
      return new VercelSandboxProvider({
        images: runner.images,
        credentials: runner.credentials,
        onCleanupError: (error, runId) =>
          logger.error("sandbox not stopped; it ends at its vendor timeout", {
            submissionId: runId,
            error,
          }),
      });
  }
}
