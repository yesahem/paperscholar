/**
 * The bundled runner service for self-hosted instances (docs/specs/13-self-hosting.md §5).
 * It alone has access to the Docker daemon, and it has no public port.
 */
import { createLogger } from "@repo/shared/logger";
import { DockerSandbox, KILL_GRACE_SECONDS } from "./docker-sandbox";
import { loadConfigOrExit } from "./env";
import { createRunnerHandler, MAX_BODY_BYTES } from "./server";

const config = loadConfigOrExit();
const logger = createLogger({ level: config.logLevel, base: { service: "runner" } });

const sandbox = new DockerSandbox({
  docker: config.docker,
  images: config.images,
  runtime: config.runtime,
  cpus: config.cpus,
  onCleanupError: (error, container) =>
    logger.error("container not removed", { error, container }),
});

for (const problem of await sandbox.check()) logger.error(problem);

const server = Bun.serve({
  port: config.port,
  maxRequestBodySize: MAX_BODY_BYTES,
  // A run may take a minute with nothing sent; keep the connection open past it.
  idleTimeout: 60 + KILL_GRACE_SECONDS + 30,
  fetch: createRunnerHandler({
    token: config.token,
    sandbox,
    logger,
    maxConcurrent: config.maxConcurrent,
    maxQueue: config.maxQueue,
  }),
});

logger.info("runner listening", {
  url: server.url.href,
  runtime: config.runtime ?? "default",
  maxConcurrent: config.maxConcurrent,
});

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info("runner shutting down", { signal });
  // Let running containers finish; their callers are waiting for them.
  await server.stop();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
