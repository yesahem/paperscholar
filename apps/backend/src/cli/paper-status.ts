/**
 * paper:status: an ingestion's stage, steps and usage
 * (docs/specs/09-paper-pipeline.md §16). Without an id, lists recent ingestions.
 *
 *   bun run paper:status [<ingestion-id>]
 */
import { desc, schema } from "@repo/db";
import { getIngestionState } from "@repo/pipeline";
import { parseArgs } from "node:util";
import { z } from "zod";
import { loadConfigOrExit } from "../load-config";
import { formatIngestion } from "./ingestion-report";
import { createPipelineServices, NO_PIPELINE_MESSAGE } from "./pipeline-services";

const { positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: { base: { type: "string" } },
});
if (positionals.length > 1) {
  console.error("Usage: bun run paper:status [<ingestion-id>]");
  process.exit(2);
}
const id = positionals[0];
if (id !== undefined && !z.uuid().safeParse(id).success) {
  console.error("paper:status: an ingestion id is a UUID, as paper:ingest printed it.");
  process.exit(2);
}

const config = loadConfigOrExit();
const services = createPipelineServices(config);
if (!services) {
  console.error(`paper:status: ${NO_PIPELINE_MESSAGE}`);
  process.exit(1);
}
try {
  if (id === undefined) {
    const rows = await services.deps.db
      .select({
        id: schema.ingestions.id,
        status: schema.ingestions.status,
        title: schema.ingestions.title,
        createdAt: schema.ingestions.createdAt,
      })
      .from(schema.ingestions)
      .orderBy(desc(schema.ingestions.createdAt))
      .limit(20);
    if (rows.length === 0) console.log("paper:status: no ingestions yet.");
    for (const row of rows) {
      console.log(
        `${row.id}  ${row.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${row.status.padEnd(20)} ${row.title ?? ""}`,
      );
    }
  } else {
    const state = await getIngestionState(services.deps.db, id);
    if (!state) {
      console.error("paper:status: no ingestion has that id.");
      process.exitCode = 1;
    } else {
      console.log(formatIngestion(state));
    }
  }
} finally {
  await services.close();
}
