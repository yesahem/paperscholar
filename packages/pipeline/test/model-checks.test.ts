import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, schema } from "@repo/db";
import {
  createIngestion,
  currentStepSchema,
  DEMO_FILES,
  demoPdf,
  getIngestionState,
  ingestionKeys,
  readJson,
  type LlmPurpose,
  type ScriptedAnswer,
  type StepFiles,
} from "../src";
import { DATABASE_URL, drain, hasPython, useHarness } from "./harness";

setDefaultTimeout(240_000);

/** relu with tests that only look at shapes and positive inputs. */
const WEAK_RELU: Pick<StepFiles, "testsPublic" | "testsHidden"> = {
  testsPublic: `import numpy as np
from solution import relu


def test_the_shape_is_kept():
    assert relu(np.zeros((2, 3))).shape == (2, 3), "the output should have the input's shape"


def test_a_vector_keeps_its_length():
    assert relu(np.ones(4)).shape == (4,), "a vector should keep its length"
`,
  testsHidden: `import numpy as np
from solution import relu


def test_positive_values_are_unchanged():
    x = np.array([0.5, 3.0])
    assert np.array_equal(relu(x), x), "positive values should be unchanged"


def test_an_empty_array_stays_empty():
    assert relu(np.array([])).size == 0, "an empty array should stay empty"


def test_a_matrix_keeps_its_shape():
    assert relu(np.ones((3, 3))).shape == (3, 3), "a matrix should keep its shape"
`,
};

describe.skipIf(!DATABASE_URL || !hasPython)("V7–V9 in the pipeline", () => {
  const harness = useHarness();

  async function run(seed: string, answers: Partial<Record<LlmPurpose, ScriptedAnswer>>) {
    const deps = harness.deps({ answers });
    const { id } = await createIngestion(deps, {
      pdf: demoPdf(seed),
      sourceType: "pdf",
      sourceRef: null,
      options: {},
      createdBy: null,
    });
    await drain(deps);
    const state = await getIngestionState(harness.db, id);
    const step = (stepId: string) => state?.steps.find((row) => row.stepId === stepId);
    return { deps, id, state, step };
  }

  const writes = (subject: string, first: (files: StepFiles) => StepFiles) => {
    let count = 0;
    const answer: ScriptedAnswer = (request) => {
      const files = DEMO_FILES[request.subject ?? ""];
      if (!files) throw new Error(`no demo step ${request.subject}`);
      if (request.subject !== subject) return { files, notes: "" };
      count += 1;
      return {
        files: count === 1 ? first(files) : files,
        notes: count === 1 ? "first" : "repaired",
      };
    };
    return answer;
  };

  test("a planted weak test is caught by V7 and repaired", async () => {
    const { deps, id, step } = await run("weak-test", {
      write: writes("relu", (files) => ({ ...files, ...WEAK_RELU })),
    });
    expect(step("relu")).toMatchObject({ status: "verified", attempts: 2 });

    const first = await readJson(
      harness.storage,
      ingestionKeys(id).attempt("relu", 1),
      currentStepSchema.pick({ verification: true }),
    );
    const v7 = first?.verification?.checks.find((check) => check.id === "V7");
    expect(v7?.status).toBe("failed");
    expect(v7?.details.join("\n")).toContain("returns x unchanged");
    expect(
      first?.verification?.mutants?.find((m) => m.description === "returns x unchanged")
        ?.outcome,
    ).toBe("survived");
    // The writer is told which wrong implementation got through.
    const repair = deps.llm.calls.filter(
      (call) => call.purpose === "write" && call.subject === "relu",
    )[1];
    expect(repair?.prompt).toContain("V7 Tests have teeth");
    expect(repair?.prompt).toContain(
      "a wrong implementation passed every test — returns x unchanged",
    );
  });

  test("a planted omission in a description is caught by V8 and repaired", async () => {
    // The tests demand a mean; this description never says so.
    const vague = (files: StepFiles): StepFiles => ({
      ...files,
      description: files.description
        .replace(
          "is the\nmean negative log-probability of the true classes (Eq. 3):",
          "combines the\nnegative log-probabilities of the true classes (Eq. 3):",
        )
        .replace(
          "$$L = -\\frac{1}{n}\\sum_{i=1}^{n} \\log p_{i, y_i}",
          "$$L = -\\sum_{i=1}^{n} \\log p_{i, y_i}",
        )
        .replace("- Summing instead of averaging over examples.\n", ""),
      // The learner reads the starter too.
      starter: files.starter.replace("Mean negative", "Negative"),
    });
    const sums = `import numpy as np
from helpers import softmax


def cross_entropy(logits, labels):
    p = softmax(logits, axis=-1)
    return float(-np.sum(np.log(p[np.arange(logits.shape[0]), labels])))
`;
    const { deps, id, step } = await run("omission", {
      write: writes("cross-entropy", vague),
      // A literal reader: sums unless the description asks for a mean.
      solve: (request) => ({
        solution:
          request.subject === "cross-entropy" &&
          !/\bmean\b/i.test(request.prompt.split("Your solution failed")[0] ?? "")
            ? sums
            : (DEMO_FILES[request.subject ?? ""]?.solution ?? ""),
      }),
    });
    expect(step("cross-entropy")).toMatchObject({ status: "verified", attempts: 2 });

    const first = await readJson(
      harness.storage,
      ingestionKeys(id).attempt("cross-entropy", 1),
      currentStepSchema.pick({ verification: true }),
    );
    expect(first?.verification?.checks.find((check) => check.id === "V8")?.status).toBe(
      "failed",
    );
    expect(first?.verification?.solve).toMatchObject({ passed: false, attempts: 2 });
    expect(first?.verification?.solve?.failures.join("\n")).toContain(
      "test_examples_are_averaged_not_summed",
    );
    // The retry saw the failing tests, as a learner would; never the tests themselves.
    const solves = deps.llm.calls.filter(
      (call) => call.purpose === "solve" && call.subject === "cross-entropy",
    );
    expect(solves[1]?.prompt).toContain("test_examples_are_averaged_not_summed");
    expect(solves[1]?.prompt).not.toContain("def test_");
    expect(solves.every((call) => !call.hasDocument)).toBe(true);
  });

  test("a blocking fidelity issue goes back to the writer; notes do not", async () => {
    let reviews = 0;
    const { step } = await run("fidelity", {
      fidelity: (request) => {
        if (request.subject !== "softmax") return { issues: [] };
        reviews += 1;
        return {
          issues:
            reviews === 1
              ? [
                  {
                    severity: "blocking",
                    paperRef: "Eq. 2",
                    summary: "The normalisation runs over the wrong index.",
                  },
                ]
              : [
                  {
                    severity: "note",
                    paperRef: "Eq. 2",
                    summary: "Temperature is not covered.",
                  },
                ],
        };
      },
    });
    expect(step("softmax")).toMatchObject({ status: "verified", attempts: 2 });
  });

  test("a waived V7 does not block, and is recorded as waived", async () => {
    const deps = harness.deps({
      answers: { write: writes("relu", (files) => ({ ...files, ...WEAK_RELU })) },
      settings: { writeAttempts: 1 },
    });
    const { id } = await createIngestion(deps, {
      pdf: demoPdf("waived"),
      sourceType: "pdf",
      sourceRef: null,
      options: {},
      createdBy: null,
    });
    // Run up to the plan, then waive V7 for relu before it is verified.
    await drain(deps);
    let state = await getIngestionState(harness.db, id);
    expect(state?.steps.find((row) => row.stepId === "relu")?.status).toBe(
      "needs_attention",
    );

    const waiver = {
      check: "V7",
      reason: "the weak tests are deliberate here",
      by: "maintainer",
      at: new Date().toISOString(),
    };
    await harness.db
      .update(schema.ingestionSteps)
      .set({ waivers: [waiver] })
      .where(eq(schema.ingestionSteps.stepId, "relu"));
    const { runChecks } = await import("../src/stages/verify");
    const current = await readJson(
      harness.storage,
      ingestionKeys(id).current("relu"),
      currentStepSchema,
    );
    const { DEMO_PLAN } = await import("../src");
    const plan = DEMO_PLAN.steps[0];
    state = await getIngestionState(harness.db, id);
    if (!current || !plan || !state) throw new Error("missing fixtures");
    const verification = await runChecks(
      {
        deps,
        task: {
          id: "t",
          ingestionId: id,
          kind: "verify",
          key: "relu",
          attempts: 1,
          failures: 0,
          leaseToken: "x",
        },
        now: () => new Date(),
        signal: new AbortController().signal,
      },
      state.ingestion,
      plan,
      current.files,
      new Set(["V7"]),
    );
    expect(verification.passed).toBe(true);
    expect(verification.checks.find((check) => check.id === "V7")?.status).toBe("waived");
  });

  test("a step failing a quick check costs no model calls for V7–V9", async () => {
    const { deps, step } = await run("quick-fail", {
      write: (request) => {
        const files = DEMO_FILES[request.subject ?? ""];
        if (request.subject !== "relu" || !files) return { files, notes: "" };
        return { files: { ...files, starter: files.solution }, notes: "" };
      },
    });
    expect(step("relu")).toMatchObject({ status: "needs_attention", attempts: 3 });
    const forRelu = deps.llm.calls
      .filter((call) => call.subject === "relu")
      .map((call) => call.purpose);
    expect(forRelu).toEqual(["write", "write", "write"]);
  });
});
