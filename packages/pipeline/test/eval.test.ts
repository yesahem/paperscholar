import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  createIngestion,
  DEMO_FILES,
  demoPdf,
  measureIngestion,
  summariseMeasures,
  type StepFiles,
} from "../src";
import { DATABASE_URL, drain, hasPython, useHarness } from "./harness";

setDefaultTimeout(240_000);

describe.skipIf(!DATABASE_URL || !hasPython)("measureIngestion", () => {
  const harness = useHarness();

  test("computes the §18 measures from the attempts and usage", async () => {
    let reluWrites = 0;
    const deps = harness.deps({
      answers: {
        write: (request) => {
          const files = DEMO_FILES[request.subject ?? ""] as StepFiles;
          if (request.subject !== "relu") return { files, notes: "" };
          reluWrites += 1;
          // The first attempt's starter already passes (V3), so relu needs a repair.
          return {
            files: reluWrites === 1 ? { ...files, starter: files.solution } : files,
            notes: "",
          };
        },
      },
    });
    const { id } = await createIngestion(deps, {
      pdf: demoPdf("eval"),
      sourceType: "pdf",
      sourceRef: null,
      options: {},
      createdBy: null,
    });
    await drain(deps);
    const measures = await measureIngestion(deps, id);
    expect(measures).toMatchObject({
      status: "ready_for_review",
      steps: 4,
      firstAttemptVerificationRate: 0.75,
      needsAttentionRate: 0,
      // relu's first attempt never reached V7; the other three killed every mutant but softmax's equivalent one.
      mutationKillRate: 1,
      independentSolveRate: 1,
      reviewerEdits: 0,
    });
    expect(measures.outputTokensPerStep).toBeGreaterThan(0);
    expect(
      summariseMeasures([measures, { ...measures, firstAttemptVerificationRate: 0.25 }])
        .firstAttemptVerificationRate,
    ).toBe(0.5);
  });
});
