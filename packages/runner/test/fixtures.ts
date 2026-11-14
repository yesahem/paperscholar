import { defaultLocalPythonPath } from "../src";

export { reluProblem, reluSolution, reluStarter } from "../src/testing";

/** Python for the harness tests: RUNNER_PYTHON, else the runner:setup venv, else python3. */
export const pythonPath = process.env.RUNNER_PYTHON || defaultLocalPythonPath();

function canImport(modules: string): boolean {
  try {
    return Bun.spawnSync([pythonPath, "-c", `import ${modules}`]).exitCode === 0;
  } catch {
    return false;
  }
}

export const hasNumpyEnvironment = canImport("numpy, pytest");
export const hasTorchEnvironment = canImport("torch, pytest");

// In CI the environment must exist; a silent skip would hide a broken runner.
if (process.env.CI && !hasNumpyEnvironment) {
  throw new Error(
    `CI: ${pythonPath} lacks numpy and pytest. Run \`bun run runner:setup\`.`,
  );
}
