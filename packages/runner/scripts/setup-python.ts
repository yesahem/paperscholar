/**
 * Creates packages/runner/.venv with the packages of the "torch" environment
 * (a superset of "numpy"), for the local runner and content:verify.
 * Requires uv: https://docs.astral.sh/uv/
 */
import { $ } from "bun";
import { fileURLToPath } from "node:url";

const runnerDir = fileURLToPath(new URL("..", import.meta.url));
const environments = `${runnerDir}environments`;
const python = `${runnerDir}.venv/bin/python`;
const pythonVersion = (await Bun.file(`${environments}/python-version`).text()).trim();

/** Reads `name==version` lines, skipping comments and `-r` includes. */
async function pins(file: string): Promise<string[]> {
  const text = await Bun.file(`${environments}/${file}`).text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("-"));
}

if (!Bun.which("uv")) {
  console.error("runner:setup needs uv. Install it: https://docs.astral.sh/uv/");
  process.exit(1);
}

$.cwd(runnerDir);
await $`uv venv --allow-existing --python ${pythonVersion} .venv`;
await $`uv pip install --python ${python} ${await pins("numpy.txt")}`;
await $`uv pip install --python ${python} --index-url https://download.pytorch.org/whl/cpu ${await pins("torch.txt")}`;
console.log(`runner:setup: ready. Local runs use ${python}`);
