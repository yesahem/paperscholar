import type { SourcePaper, SourceProblem } from "@repo/content";
import type { VerifiableProblem } from "./types";

/** A problem from the content folder, in the shape verification takes. */
export function verifiableFromSource(
  paper: SourcePaper,
  problem: SourceProblem,
): VerifiableProblem {
  return {
    ref: `${paper.id}/${problem.id}`,
    entryPoint: problem.meta.entryPoint,
    environment: problem.meta.environment,
    allowedPackages: problem.meta.allowedPackages,
    prohibitedImports: problem.meta.prohibitedImports,
    timeLimitSeconds: problem.meta.timeLimitSeconds,
    memoryLimitMb: problem.meta.memoryLimitMb,
    description: problem.description,
    tutorial: problem.tutorial,
    starter: problem.starter,
    solution: problem.solution,
    helpers: problem.helpers,
    testsPublic: problem.testsPublic,
    testsHidden: problem.testsHidden,
  };
}
