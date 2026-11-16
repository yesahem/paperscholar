/**
 * paper:eval: runs the pipeline on the reference papers and reports the
 * measures of docs/specs/09-paper-pipeline.md §18. It spends real money with
 * a real model, so a person starts it, before merging a change to the prompts,
 * the model or the checks. A paper already ingested is measured as it stands
 * unless --fresh cancels that ingestion and runs it again.
 *
 *   bun run paper:eval [--set packages/pipeline/eval/papers.json] [--fresh] [--out report.json]
 */
import {
  cancelIngestion,
  createIngestion,
  evalSetSchema,
  fetchArxivPdf,
  measureIngestion,
  parseArxivId,
  PROMPT_VERSION,
  summariseMeasures,
  type IngestionMeasures,
} from "@repo/pipeline";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadConfigOrExit } from "../load-config";
import { DEFAULT_CONTENT_ROOT } from "./paths";
import {
  createPipelineServices,
  NO_PIPELINE_MESSAGE,
  resolveFromBase,
  runUntilSettled,
} from "./pipeline-services";

const { values } = parseArgs({
  strict: true,
  options: {
    set: { type: "string" },
    fresh: { type: "boolean", default: false },
    out: { type: "string" },
    base: { type: "string" },
  },
});

const setPath = values.set
  ? resolveFromBase(values.base, values.set)
  : `${dirname(DEFAULT_CONTENT_ROOT)}/packages/pipeline/eval/papers.json`;
const set = evalSetSchema.parse(await Bun.file(setPath).json());

const config = loadConfigOrExit();
const services = createPipelineServices(config);
if (!services) {
  console.error(`paper:eval: ${NO_PIPELINE_MESSAGE}`);
  process.exit(1);
}
const { deps } = services;
const percent = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

try {
  console.log(
    `paper:eval: ${set.papers.length} papers, model ${deps.llm.model}, prompts ${PROMPT_VERSION}`,
  );
  const results: (IngestionMeasures & { name: string })[] = [];
  for (const paper of set.papers) {
    const arxivId = paper.source.startsWith("arxiv:") ? parseArxivId(paper.source) : null;
    const pdf = arxivId
      ? await fetchArxivPdf(arxivId, { maxBytes: deps.settings.maxPdfBytes })
      : new Uint8Array(
          await Bun.file(resolveFromBase(dirname(setPath), paper.source)).arrayBuffer(),
        );
    const input = {
      pdf,
      sourceType: arxivId ? ("arxiv" as const) : ("pdf" as const),
      sourceRef: arxivId,
      options: {},
      createdBy: null,
    };
    let ingestion = await createIngestion(deps, input);
    if (!ingestion.created && values.fresh && ingestion.status !== "published") {
      await cancelIngestion(deps, ingestion.id);
      ingestion = await createIngestion(deps, input);
    }
    console.log(
      `\n${paper.name}: ${ingestion.created ? "running" : "measuring existing"} ${ingestion.id}`,
    );
    await runUntilSettled(deps, ingestion.id, (state) =>
      console.log(
        `  ${state.ingestion.status} (${state.steps.filter((step) => step.status === "verified").length}/${state.steps.length} verified)`,
      ),
    );
    results.push({ name: paper.name, ...(await measureIngestion(deps, ingestion.id)) });
  }

  const summary = summariseMeasures(results);
  console.log(
    "\npaper                          steps  1st-pass  attention  kill  solve  out/step",
  );
  for (const result of results) {
    console.log(
      `${result.name.padEnd(30)} ${String(result.steps).padStart(5)}  ${percent(result.firstAttemptVerificationRate).padStart(8)}  ${percent(result.needsAttentionRate).padStart(9)}  ${percent(result.mutationKillRate).padStart(4)}  ${percent(result.independentSolveRate).padStart(5)}  ${String(result.outputTokensPerStep ?? "—").padStart(8)}`,
    );
  }
  console.log(
    `${"all".padEnd(30)} ${String(summary.steps).padStart(5)}  ${percent(summary.firstAttemptVerificationRate).padStart(8)}  ${percent(summary.needsAttentionRate).padStart(9)}  ${percent(summary.mutationKillRate).padStart(4)}  ${percent(summary.independentSolveRate).padStart(5)}  ${String(summary.outputTokensPerStep === null ? "—" : Math.round(summary.outputTokensPerStep)).padStart(8)}`,
  );
  if (values.out) {
    const report = {
      model: deps.llm.model,
      promptVersion: PROMPT_VERSION,
      at: new Date().toISOString(),
      summary,
      papers: results,
    };
    await Bun.write(
      resolveFromBase(values.base, values.out),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
} finally {
  await services.close();
}
