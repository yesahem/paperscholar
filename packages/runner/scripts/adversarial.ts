/**
 * runner:adversarial: the adversarial suite of docs/specs/07-runner.md §10,
 * against a provider that isolates runs.
 *
 *   bun run runner:adversarial --provider http      # RUNNER_URL, RUNNER_TOKEN
 *   bun run runner:adversarial --provider vercel    # RUNNER_IMAGE_*, Vercel credentials
 *
 * Exit code 0 when every case behaves as expected, 1 otherwise. The local
 * provider is refused: it isolates nothing, and the suite includes a fork bomb.
 */
import { EnvError, parseEnv } from "@repo/shared";
import { parseArgs } from "node:util";
import { z } from "zod";
import { runAdversarialSuite } from "../src/adversarial";
import { HttpRunnerProvider } from "../src/providers/http";
import { VercelSandboxProvider } from "../src/providers/vercel";
import type { SandboxProvider } from "../src/types";

const { values: args } = parseArgs({
  options: { provider: { type: "string" } },
  strict: true,
});

const optional = z.string().trim().min(1).optional();
function readEnv() {
  try {
    return parseEnv(
      z.object({
        RUNNER_URL: optional,
        RUNNER_TOKEN: optional,
        RUNNER_IMAGE_NUMPY: optional,
        RUNNER_IMAGE_TORCH: optional,
        VERCEL_TEAM_ID: optional,
        VERCEL_PROJECT_ID: optional,
        VERCEL_TOKEN: optional,
      }),
      process.env,
      { app: "runner:adversarial", exampleFile: "packages/runner/.env.example" },
    );
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}

function fail(message: string): never {
  console.error(`runner:adversarial: ${message}`);
  process.exit(2);
}

const env = readEnv();
let provider: SandboxProvider;
if (args.provider === "http") {
  if (!env.RUNNER_URL || !env.RUNNER_TOKEN)
    fail("--provider http needs RUNNER_URL and RUNNER_TOKEN.");
  provider = new HttpRunnerProvider({ url: env.RUNNER_URL, token: env.RUNNER_TOKEN });
} else if (args.provider === "vercel") {
  if (!env.RUNNER_IMAGE_NUMPY || !env.RUNNER_IMAGE_TORCH) {
    fail("--provider vercel needs RUNNER_IMAGE_NUMPY and RUNNER_IMAGE_TORCH.");
  }
  const credentials =
    env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID && env.VERCEL_TOKEN
      ? {
          teamId: env.VERCEL_TEAM_ID,
          projectId: env.VERCEL_PROJECT_ID,
          token: env.VERCEL_TOKEN,
        }
      : null;
  provider = new VercelSandboxProvider({
    images: { numpy: env.RUNNER_IMAGE_NUMPY, torch: env.RUNNER_IMAGE_TORCH },
    credentials,
    onCleanupError: (error, runId) =>
      console.error(`sandbox for ${runId} not stopped`, error),
  });
} else {
  fail("choose --provider http or --provider vercel.");
}

console.log(`runner:adversarial: provider ${provider.name}`);
const started = performance.now();
const reports = await runAdversarialSuite(provider, {
  onCase: (report) =>
    console.log(
      `${report.passed ? "✓" : "✗"} ${report.name}: expected ${report.expected}\n    ${report.detail}`,
    ),
});
const failed = reports.filter((report) => !report.passed).length;
console.log(
  `\n${reports.length - failed}/${reports.length} as expected in ${((performance.now() - started) / 1000).toFixed(1)} s.`,
);
process.exit(failed === 0 ? 0 : 1);
