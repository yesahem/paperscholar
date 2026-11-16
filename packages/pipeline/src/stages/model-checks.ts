import { extractPythonInterface } from "@repo/content";
import { buildRunRequest, toVerdict, type RunResult } from "@repo/runner";
import type { TaskContext } from "../engine/tick";
import { PROMPTS, render } from "../prompts";
import {
  equivalenceAnswerSchema,
  fidelityAnswerSchema,
  mutantsAnswerSchema,
  solveAnswerSchema,
  type CheckOutcome,
  type FidelityIssue,
  type MutantResult,
  type PlanStep,
  type SolveResult,
  type StepFiles,
} from "../schemas";
import { MODEL_CHECKS, type ModelCheckId, type VerifiableProblem } from "../verify/types";
import { toRunnable } from "../verify/verify-problem";
import { callModel, documentFor, loadOutline, type IngestionRow } from "./common";

/** V7 asks for at least this many mutants, and needs this many usable ones. */
export const MUTANTS_REQUESTED = 5;
export const MIN_USABLE_MUTANTS = 3;
/** Evidence is shown to the writer and the reviewer; long code is cut. */
const MAX_EVIDENCE_CODE = 2_000;

const clipCode = (code: string) =>
  code.length > MAX_EVIDENCE_CODE ? `${code.slice(0, MAX_EVIDENCE_CODE)}\n# … cut` : code;

function outcome(id: ModelCheckId, details: string[], failed: boolean): CheckOutcome {
  return { id, name: MODEL_CHECKS[id], status: failed ? "failed" : "passed", details };
}

export function skipped(id: ModelCheckId, reason: string): CheckOutcome {
  return { id, name: MODEL_CHECKS[id], status: "skipped", details: [reason] };
}

/** Failing tests as a learner sees them: name and message, hidden ones included. */
function failuresOf(result: RunResult): string[] {
  if (result.outcome !== "completed") {
    return [
      `${result.outcome.replaceAll("_", " ")}${result.errorOutput ? `: ${result.errorOutput.split("\n")[0]}` : ""}`,
    ];
  }
  return result.tests
    .filter((test) => test.status !== "passed")
    .map((test) => `${test.name}: ${test.message ?? test.status}`);
}

interface CheckRun<Evidence> {
  check: CheckOutcome;
  evidence: Evidence;
  sandboxRuns: number;
}

/** The step and its files, as the model sees them in V7 and V9 (no tests for V9). */
const filesForModel = (step: PlanStep, files: StepFiles, withTests: boolean) =>
  JSON.stringify(
    {
      step,
      description: files.description,
      tutorial: files.tutorial,
      starter: files.starter,
      solution: files.solution,
      helpers: files.helpers,
      ...(withTests
        ? { testsPublic: files.testsPublic, testsHidden: files.testsHidden }
        : {}),
    },
    null,
    2,
  );

/**
 * V7 (docs/specs/09-paper-pipeline.md §8): every plausible wrong
 * implementation must fail at least one test. Survivors the model judges
 * equivalent to the reference are flagged for the reviewer, not sent back.
 */
export async function checkMutants(
  context: TaskContext,
  row: IngestionRow,
  step: PlanStep,
  files: StepFiles,
  problem: VerifiableProblem,
): Promise<CheckRun<MutantResult[]>> {
  const document = await documentFor(context, row);
  const outline = await loadOutline(context);
  const answer = await callModel(context, {
    purpose: "mutants",
    subject: step.id,
    system: PROMPTS.system,
    document,
    context: [JSON.stringify(outline)],
    prompt: render(PROMPTS.mutants, {
      count: String(MUTANTS_REQUESTED),
      stepId: step.id,
      files: filesForModel(step, files, true),
    }),
    schema: mutantsAnswerSchema,
    schemaName: "mutants",
    effort: "medium",
    maxTokens: 32_000,
  });

  const runnable = toRunnable(problem);
  const runId = problem.ref.replace(/[^a-z0-9-]/g, "-");
  const results: MutantResult[] = [];
  for (const [index, mutant] of answer.mutants.entries()) {
    const run = await context.deps.sandbox.run(
      buildRunRequest(runnable, {
        runId: `${runId}-mutant-${index + 1}`,
        code: mutant.code,
        mode: "submit",
      }),
      context.signal,
    );
    const verdict = toVerdict(run);
    const base = {
      description: mutant.description,
      code: mutant.code,
      reason: null,
      killedBy: [],
    };
    if (verdict.verdict === "passed") results.push({ ...base, outcome: "survived" });
    else if (
      ["failed", "time_limit_exceeded", "memory_limit_exceeded"].includes(verdict.verdict)
    ) {
      results.push({
        ...base,
        outcome: "killed",
        killedBy: run.tests
          .filter((test) => test.status !== "passed")
          .map((test) => test.name),
      });
    } else {
      results.push({
        ...base,
        outcome: "invalid",
        reason: failuresOf(run)[0] ?? verdict.verdict,
      });
    }
  }

  const survivors = results.flatMap((result, index) =>
    result.outcome === "survived" ? [index] : [],
  );
  if (survivors.length > 0) {
    const judged = await callModel(context, {
      purpose: "equivalence",
      subject: step.id,
      system: PROMPTS.system,
      document,
      context: [JSON.stringify(outline)],
      prompt: render(PROMPTS.equivalence, {
        stepId: step.id,
        solution: files.solution,
        description: files.description,
        mutants: survivors
          .map(
            (index) =>
              `Mutant ${index}: ${results[index]?.description}\n\n\`\`\`python\n${results[index]?.code}\n\`\`\``,
          )
          .join("\n\n"),
      }),
      schema: equivalenceAnswerSchema,
      schemaName: "equivalence",
      effort: "medium",
      maxTokens: 8_000,
    });
    for (const judgement of judged.judgements) {
      const result = results[judgement.index];
      if (result?.outcome === "survived" && judgement.equivalent) {
        results[judgement.index] = {
          ...result,
          outcome: "equivalent",
          reason: judgement.reason,
        };
      }
    }
  }

  const usable = results.filter((result) => result.outcome !== "invalid");
  const surviving = results.filter((result) => result.outcome === "survived");
  const details = [
    ...surviving.map(
      (result) =>
        `a wrong implementation passed every test — ${result.description}. Add a test that catches it:\n${clipCode(result.code)}`,
    ),
    ...(usable.length < MIN_USABLE_MUTANTS
      ? [
          `only ${usable.length} usable mutants were produced; at least ${MIN_USABLE_MUTANTS} are needed`,
        ]
      : []),
  ];
  const killed = results.filter((result) => result.outcome === "killed").length;
  const notes = results
    .filter((result) => result.outcome === "equivalent")
    .map(
      (result) =>
        `judged equivalent, not counted: ${result.description} (${result.reason ?? ""})`,
    );
  return {
    check: outcome(
      "V7",
      details.length > 0
        ? details
        : [`${killed} of ${usable.length} mutants killed`, ...notes],
      details.length > 0,
    ),
    evidence: results,
    sandboxRuns: answer.mutants.length,
  };
}

/** What a learner is given, and nothing more: the input to the V8 solver. */
export function learnerView(
  step: PlanStep,
  files: StepFiles,
  problem: VerifiableProblem,
): string {
  const helpers =
    files.helpers === null
      ? "There is no helper module."
      : `**helpers.py** (interface only; importable as \`helpers\`)\n\n\`\`\`python\n${extractPythonInterface(files.helpers)}\n\`\`\``;
  return render(PROMPTS.solve, {
    description: files.description,
    starter: files.starter,
    helpers,
    allowed: step.allowedPackages.length > 0 ? step.allowedPackages.join(", ") : "none",
    prohibited:
      step.prohibitedImports.length > 0 ? step.prohibitedImports.join(", ") : "none",
    timeLimit: String(problem.timeLimitSeconds),
  });
}

/**
 * V8 (§8): a fresh call that sees only what a learner sees — no paper, no
 * solution, no tests — must pass every test, with one retry that sees the
 * failing tests' names and messages.
 */
export async function checkIndependentSolve(
  context: TaskContext,
  step: PlanStep,
  files: StepFiles,
  problem: VerifiableProblem,
): Promise<CheckRun<SolveResult>> {
  const runnable = toRunnable(problem);
  const runId = problem.ref.replace(/[^a-z0-9-]/g, "-");
  const view = learnerView(step, files, problem);
  let prompt = view;
  let solve: SolveResult = { passed: false, attempts: 0, solution: "", failures: [] };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const answer = await callModel(context, {
      purpose: "solve",
      subject: step.id,
      system: PROMPTS.solveSystem,
      document: null,
      context: [],
      prompt,
      schema: solveAnswerSchema,
      schemaName: "solution",
      effort: "medium",
      maxTokens: 16_000,
    });
    const run = await context.deps.sandbox.run(
      buildRunRequest(runnable, {
        runId: `${runId}-solver-${attempt}`,
        code: answer.solution,
        mode: "submit",
      }),
      context.signal,
    );
    const passed = toVerdict(run).verdict === "passed";
    solve = {
      passed,
      attempts: attempt,
      solution: answer.solution,
      failures: passed ? [] : failuresOf(run),
    };
    if (passed) break;
    prompt = `${view}\n\n${render(PROMPTS.solveRetry, {
      failures: solve.failures.map((failure) => `- ${failure}`).join("\n"),
      solution: answer.solution,
    })}`;
  }
  const details = solve.passed
    ? [
        `solved from the description in ${solve.attempts === 1 ? "one attempt" : "two attempts"}`,
      ]
    : [
        "a solver given only the description, starter and limits could not pass the tests: the description is under-specified, or the tests demand something it does not state",
        ...solve.failures.slice(0, 6).map((failure) => `failing: ${failure}`),
        `the solver's code:\n${clipCode(solve.solution)}`,
      ];
  return {
    check: outcome("V8", details, !solve.passed),
    evidence: solve,
    sandboxRuns: solve.attempts,
  };
}

/** V9 (§8): blocking issues go back to the writer; notes go to the reviewer. */
export async function checkFidelity(
  context: TaskContext,
  row: IngestionRow,
  step: PlanStep,
  files: StepFiles,
): Promise<CheckRun<FidelityIssue[]>> {
  const document = await documentFor(context, row);
  const outline = await loadOutline(context);
  const answer = await callModel(context, {
    purpose: "fidelity",
    subject: step.id,
    system: PROMPTS.system,
    document,
    context: [JSON.stringify(outline)],
    prompt: render(PROMPTS.fidelity, {
      stepId: step.id,
      refs: step.paperRefs.join(", ") || "none given",
      files: filesForModel(step, files, false),
    }),
    schema: fidelityAnswerSchema,
    schemaName: "fidelity_review",
    effort: "medium",
    maxTokens: 16_000,
  });
  const describe = (issue: FidelityIssue) =>
    `${issue.severity} (${issue.paperRef}): ${issue.summary}`;
  const blocking = answer.issues.filter((issue) => issue.severity === "blocking");
  const details =
    blocking.length > 0 ? blocking.map(describe) : answer.issues.map(describe);
  return {
    check: outcome(
      "V9",
      details.length > 0 ? details : ["no issues found"],
      blocking.length > 0,
    ),
    evidence: answer.issues,
    sandboxRuns: 0,
  };
}
