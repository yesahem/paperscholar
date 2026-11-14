/**
 * paper:ingest: starts the paper pipeline on a PDF or an arXiv paper
 * (docs/specs/09-paper-pipeline.md §16). Prints the ingestion id; with
 * --wait, also runs the pipeline here until the draft is ready for review.
 *
 *   bun run paper:ingest ./attention.pdf --confirm-rights
 *   bun run paper:ingest arxiv:1706.03762 --confirm-rights --focus "attention only" --pause-after-plan
 *   bun run paper:ingest --demo --wait          (LLM_DRIVER=fake: the demonstration paper)
 */
import {
  createIngestion,
  demoPdf,
  fetchArxivPdf,
  ingestionOptionsSchema,
  parseArxivId,
  PipelineError,
} from "@repo/pipeline";
import { RUN_ENVIRONMENTS } from "@repo/shared";
import { parseArgs } from "node:util";
import { z } from "zod";
import { loadConfigOrExit } from "../load-config";
import { formatIngestion } from "./ingestion-report";
import {
  createPipelineServices,
  NO_PIPELINE_MESSAGE,
  resolveFromBase,
  runUntilSettled,
  userIdByEmail,
} from "./pipeline-services";

const USAGE = `Usage: bun run paper:ingest <file.pdf | arxiv:ID> --confirm-rights [options]
       bun run paper:ingest --demo [--wait]

  --confirm-rights      you may use this paper to make learning material (required)
  --focus <text>        what the steps should concentrate on
  --target-steps <n>    roughly how many steps
  --environment <env>   ${RUN_ENVIRONMENTS.join(" or ")} for every step
  --pause-after-plan    stop for plan review before writing
  --force               ingest again a paper that was already published
  --by <email>          the maintainer to record as the uploader
  --wait                run the pipeline here until it needs a person
  --demo                ingest the demonstration paper (needs LLM_DRIVER=fake)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    "confirm-rights": { type: "boolean", default: false },
    focus: { type: "string" },
    "target-steps": { type: "string" },
    environment: { type: "string" },
    "pause-after-plan": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    by: { type: "string" },
    wait: { type: "boolean", default: false },
    demo: { type: "boolean", default: false },
    base: { type: "string" },
  },
});

function fail(message: string, code = 2): never {
  console.error(message);
  process.exit(code);
}

const source = positionals[0];
if (
  values.demo ? positionals.length > 0 : positionals.length !== 1 || source === undefined
) {
  fail(USAGE);
}
if (!values.demo && !values["confirm-rights"]) {
  fail(
    "paper:ingest: confirm with --confirm-rights that you may use this paper for learning material.",
  );
}
const options = ingestionOptionsSchema.safeParse({
  focus: values.focus ?? null,
  targetSteps:
    values["target-steps"] === undefined ? null : Number(values["target-steps"]),
  environment: values.environment ?? null,
  pauseAfterPlan: values["pause-after-plan"],
});
if (!options.success) fail(`paper:ingest: ${z.prettifyError(options.error)}`);

const config = loadConfigOrExit();
if (values.demo && config.pipeline.llm?.driver !== "fake") {
  fail(
    "paper:ingest: --demo needs LLM_DRIVER=fake, so the demonstration paper costs nothing.",
  );
}
const services = createPipelineServices(config);
if (!services) fail(`paper:ingest: ${NO_PIPELINE_MESSAGE}`, 1);
const { deps } = services;

try {
  const createdBy = values.by ? await userIdByEmail(deps, values.by) : null;
  if (values.by && !createdBy)
    fail("paper:ingest: no account has that email address.", 1);

  const fromArxiv = !values.demo && (source ?? "").toLowerCase().startsWith("arxiv:");
  const arxivId = fromArxiv ? parseArxivId(source ?? "") : null;
  if (fromArxiv && !arxivId)
    fail(`paper:ingest: ${source} is not an arXiv id such as arxiv:1706.03762.`);
  const pdf = values.demo
    ? demoPdf(new Date().toISOString())
    : arxivId
      ? await fetchArxivPdf(arxivId, { maxBytes: deps.settings.maxPdfBytes })
      : new Uint8Array(
          await Bun.file(resolveFromBase(values.base, source ?? "")).arrayBuffer(),
        );

  const result = await createIngestion(deps, {
    pdf,
    sourceType: arxivId ? "arxiv" : "pdf",
    sourceRef: arxivId,
    options: options.data,
    createdBy,
    force: values.force,
  });
  console.log(
    result.created
      ? `paper:ingest: started ${result.id}`
      : `paper:ingest: this paper was already ingested as ${result.id} (${result.status}); use --force to ingest a published paper again`,
  );

  if (values.wait && result.created) {
    const final = await runUntilSettled(deps, result.id, (state) => {
      console.log(`\n${formatIngestion(state)}`);
    });
    if (final.ingestion.status === "failed") process.exitCode = 1;
  } else if (result.created) {
    console.log(
      "Run `bun run worker` (or let the API run it) and follow it with `bun run paper:status <id>`.",
    );
  }
} catch (error) {
  if (error instanceof PipelineError) {
    console.error(`paper:ingest: ${error.message}`);
    process.exitCode = 1;
  } else if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    console.error(`paper:ingest: no such file: ${source}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await services.close();
}
