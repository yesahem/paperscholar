/// <reference path="./text-modules.d.ts" />
import equivalenceTemplate from "../prompts/equivalence.md" with { type: "text" };
import fidelityTemplate from "../prompts/fidelity.md" with { type: "text" };
import mutantsTemplate from "../prompts/mutants.md" with { type: "text" };
import planTemplate from "../prompts/plan.md" with { type: "text" };
import readTemplate from "../prompts/read.md" with { type: "text" };
import repairTemplate from "../prompts/repair.md" with { type: "text" };
import solveRetryTemplate from "../prompts/solve-retry.md" with { type: "text" };
import solveSystemPrompt from "../prompts/solve-system.md" with { type: "text" };
import solveTemplate from "../prompts/solve.md" with { type: "text" };
import systemPrompt from "../prompts/system.md" with { type: "text" };
import writeTemplate from "../prompts/write.md" with { type: "text" };

/**
 * Version of the prompts in packages/pipeline/prompts, recorded on every
 * ingestion. Change it with any prompt change, and run the eval
 * (docs/specs/09-paper-pipeline.md §14, §18).
 */
export const PROMPT_VERSION = "2026-11-14.2";

export const PROMPTS = {
  system: systemPrompt,
  read: readTemplate,
  plan: planTemplate,
  write: writeTemplate,
  repair: repairTemplate,
  mutants: mutantsTemplate,
  equivalence: equivalenceTemplate,
  /** The V8 solver's own system prompt: it shares nothing with the writer. */
  solveSystem: solveSystemPrompt,
  solve: solveTemplate,
  solveRetry: solveRetryTemplate,
  fidelity: fidelityTemplate,
} as const;

/** Fills `{{name}}` placeholders. Every placeholder must be given, and every value used. */
export function render(template: string, values: Record<string, string>): string {
  const used = new Set<string>();
  const output = template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined)
      throw new Error(`Prompt placeholder {{${name}}} has no value`);
    used.add(name);
    return value;
  });
  const unused = Object.keys(values).filter((name) => !used.has(name));
  if (unused.length > 0) throw new Error(`Prompt values not used: ${unused.join(", ")}`);
  return output.trim();
}
