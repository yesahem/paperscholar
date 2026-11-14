import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { LocalProvider, type RunResult, type SandboxProvider } from "../src";
import { ADVERSARIAL_CASES, runAdversarialSuite } from "../src/adversarial";
import { hasNumpyEnvironment, pythonPath } from "./fixtures";

setDefaultTimeout(120_000);

describe("the adversarial suite", () => {
  test("covers every row of spec 07 §10", () => {
    expect(ADVERSARIAL_CASES.map((entry) => entry.name)).toHaveLength(12);
    // These would harm a machine that isolates nothing.
    const unsafe = ADVERSARIAL_CASES.filter((entry) => !entry.safeWithoutIsolation).map(
      (entry) => entry.name,
    );
    expect(unsafe).toEqual([
      "Allocates 10 GB",
      "Opens a socket to a public address (in a test file, past the import scan)",
      "Fork bomb",
      "Writes a file, then a second run looks for it",
    ]);
  });

  test("a provider that throws fails the case instead of stopping the suite", async () => {
    const broken: SandboxProvider = {
      name: "broken",
      run: async (): Promise<RunResult> => {
        throw new Error("no sandbox");
      },
    };
    const reports = await runAdversarialSuite(broken, {
      cases: ADVERSARIAL_CASES.slice(0, 2),
    });
    expect(reports.map((report) => report.passed)).toEqual([false, false]);
    expect(reports[0]?.detail).toContain("no sandbox");
  });

  test.skipIf(!hasNumpyEnvironment)(
    "its safe cases judge real results correctly",
    async () => {
      const provider = new LocalProvider({ pythonPath, nodeEnv: "test" });
      const cases = ADVERSARIAL_CASES.filter((entry) => entry.safeWithoutIsolation);
      const reports = await runAdversarialSuite(provider, { cases });
      for (const report of reports) {
        expect({
          name: report.name,
          passed: report.passed,
          detail: report.detail,
        }).toMatchObject({
          passed: true,
        });
      }
    },
  );
});
