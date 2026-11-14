import type { IngestionState } from "@repo/pipeline";

const number = (value: number) => value.toLocaleString("en");

/** A plain-text summary of an ingestion, for paper:ingest and paper:status. */
export function formatIngestion(state: IngestionState): string {
  const { ingestion, usage, steps } = state;
  const lines = [
    `${ingestion.id}  ${ingestion.status}${ingestion.title ? `  "${ingestion.title}"` : ""}`,
  ];
  if (ingestion.paperId) lines.push(`  paper:   ${ingestion.paperId} (draft)`);
  if (ingestion.error) lines.push(`  error:   ${ingestion.error}`);
  if (ingestion.failedStage)
    lines.push(`  stopped at the ${ingestion.failedStage} stage`);
  lines.push(`  model:   ${ingestion.model}, prompts ${ingestion.promptVersion}`);
  lines.push(
    `  usage:   ${number(usage.calls)} calls, ${number(usage.inputTokens)} input + ${number(usage.cacheReadTokens)} cache-read + ${number(usage.cacheWriteTokens)} cache-write tokens in, ${number(usage.outputTokens)} out; ${number(usage.sandboxRuns)} sandbox runs`,
  );
  if (steps.length > 0) {
    lines.push("  steps:");
    for (const step of steps) {
      const failed =
        step.verification &&
        typeof step.verification === "object" &&
        "checks" in step.verification
          ? (step.verification.checks as { id: string; status: string }[])
              .filter((check) => check.status === "failed")
              .map((check) => check.id)
          : [];
      lines.push(
        `    ${String(step.position + 1).padStart(2)}. ${step.stepId.padEnd(32)} ${step.status.padEnd(16)} attempt ${step.attempts}${failed.length ? `  failed: ${failed.join(", ")}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}
