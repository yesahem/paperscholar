/**
 * Builds the sandbox images from the pinned requirement files
 * (docs/specs/07-runner.md §8).
 *
 *   bun run runner:images [--environment numpy|torch] [--tag-prefix <prefix>]
 *                         [--platform linux/amd64] [--push]
 *
 * Images are named `<prefix>numpy` and `<prefix>torch`; the default prefix is
 * `paperscholar-sandbox-`, which the bundled runner expects. For the hosted
 * sandbox, build for linux/amd64 with a Vercel Container Registry prefix and
 * --push, then set RUNNER_IMAGE_NUMPY and RUNNER_IMAGE_TORCH to the names.
 */
import { RUN_ENVIRONMENTS } from "@repo/shared";
import { $ } from "bun";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    environment: { type: "string" },
    "tag-prefix": { type: "string", default: "paperscholar-sandbox-" },
    platform: { type: "string" },
    push: { type: "boolean", default: false },
  },
  strict: true,
});

const environments =
  args.environment === undefined ? [...RUN_ENVIRONMENTS] : [args.environment];
for (const environment of environments) {
  if (!(RUN_ENVIRONMENTS as readonly string[]).includes(environment)) {
    console.error(`runner:images: unknown environment "${environment}".`);
    process.exit(2);
  }
}

const runnerDir = fileURLToPath(new URL("..", import.meta.url));
const pythonVersion = (
  await Bun.file(`${runnerDir}environments/python-version`).text()
).trim();
const dockerfile = await Bun.file(`${runnerDir}images/Dockerfile`).text();
if (!dockerfile.includes(`FROM python:${pythonVersion}.`)) {
  console.error(
    `runner:images: images/Dockerfile must start from Python ${pythonVersion} (environments/python-version).`,
  );
  process.exit(2);
}

for (const environment of environments) {
  const tag = `${args["tag-prefix"]}${environment}`;
  const platform = args.platform ? ["--platform", args.platform] : [];
  console.log(`runner:images: building ${tag}`);
  await $`docker build ${platform} -f ${runnerDir}images/Dockerfile --build-arg ENVIRONMENT=${environment} -t ${tag} ${runnerDir}environments`;
  if (args.push) await $`docker push ${tag}`;
}
