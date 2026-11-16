import { PIPELINE_DEFAULTS } from "@repo/shared";
import type { Outline, Plan } from "@repo/shared/pipeline-schemas";

/** The pipeline's documents; defined in @repo/shared so the web app shares them. */
export * from "@repo/shared/pipeline-schemas";

/**
 * Problems with a plan that the schema alone cannot express: unique ids,
 * dependencies only on earlier steps, chunk ids that exist, a step count in range.
 */
export function checkPlan(
  plan: Plan,
  outline: Pick<Outline, "chunks">,
  range: { min: number; max: number } = {
    min: PIPELINE_DEFAULTS.minSteps,
    max: PIPELINE_DEFAULTS.maxSteps,
  },
): string[] {
  const problems: string[] = [];
  if (plan.steps.length < range.min || plan.steps.length > range.max) {
    problems.push(
      `the plan has ${plan.steps.length} steps; it needs ${range.min}–${range.max}`,
    );
  }
  const chunkIds = new Set(outline.chunks.map((chunk) => chunk.id));
  const seen = new Set<string>();
  for (const step of plan.steps) {
    if (seen.has(step.id)) problems.push(`step id ${step.id} is used twice`);
    for (const dependency of step.dependsOn) {
      if (!seen.has(dependency)) {
        problems.push(
          `${step.id} depends on ${dependency}, which is not an earlier step`,
        );
      }
    }
    for (const chunkId of step.chunkIds) {
      if (!chunkIds.has(chunkId))
        problems.push(`${step.id} cites unknown chunk ${chunkId}`);
    }
    seen.add(step.id);
  }
  return problems;
}
