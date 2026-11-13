import { extractPythonInterface } from "./python-interface";
import type { StoredProblemPrivate, StoredProblemPublic } from "./schemas/stored";
import type { SourceProblem } from "./source/read-library";

/** Splits an authored problem into what learners may see and what they never see. */
export function toStoredProblem(problem: SourceProblem): {
  public: StoredProblemPublic;
  private: StoredProblemPrivate;
} {
  const { meta } = problem;
  return {
    public: {
      id: problem.id,
      order: problem.order,
      status: meta.status,
      title: meta.title,
      summary: meta.summary,
      difficulty: meta.difficulty,
      type: meta.type,
      entryPoint: meta.entryPoint,
      environment: meta.environment,
      allowedPackages: meta.allowedPackages,
      prohibitedImports: meta.prohibitedImports,
      timeLimitSeconds: meta.timeLimitSeconds,
      memoryLimitMb: meta.memoryLimitMb,
      paperRefs: meta.paperRefs,
      description: problem.description,
      tutorial: problem.tutorial,
      starter: problem.starter,
      helpersInterface:
        problem.helpers === null ? null : extractPythonInterface(problem.helpers),
      contentHash: problem.contentHash,
    },
    private: {
      id: problem.id,
      solution: problem.solution,
      testsPublic: problem.testsPublic,
      testsHidden: problem.testsHidden,
      helpers: problem.helpers,
    },
  };
}
