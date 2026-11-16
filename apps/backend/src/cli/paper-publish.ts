/**
 * paper:publish: publishes a reviewed draft (docs/specs/09-paper-pipeline.md
 * §11, §16) when every step meets the publish rules; otherwise lists what is
 * missing. Self-hosters can review with paper:status and publish from here.
 *
 *   bun run paper:publish <ingestion-id> --by <email>
 */
import { PipelineError, publishIngestion, publishReadiness } from "@repo/pipeline";
import { parseArgs } from "node:util";
import { z } from "zod";
import { loadConfigOrExit } from "../load-config";
import {
  createPipelineServices,
  NO_PIPELINE_MESSAGE,
  userIdByEmail,
} from "./pipeline-services";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: { by: { type: "string" }, base: { type: "string" } },
});
const id = positionals[0];
if (positionals.length !== 1 || !z.uuid().safeParse(id).success || !values.by) {
  console.error("Usage: bun run paper:publish <ingestion-id> --by <maintainer email>");
  process.exit(2);
}

const config = loadConfigOrExit();
const services = createPipelineServices(config);
if (!services) {
  console.error(`paper:publish: ${NO_PIPELINE_MESSAGE}`);
  process.exit(1);
}
try {
  const by = await userIdByEmail(services.deps, values.by);
  if (!by) {
    console.error("paper:publish: no account has that email address.");
    process.exitCode = 1;
  } else {
    const problems = await publishReadiness(services.deps, id ?? "");
    if (problems.length > 0) {
      console.error(
        `paper:publish: not ready to publish:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
      );
      process.exitCode = 1;
    } else {
      const entry = await publishIngestion(services.deps, id ?? "", by);
      console.log(
        `paper:publish: ${entry.id} v${entry.version} is published; content pages pick it up within a minute.`,
      );
    }
  }
} catch (error) {
  if (error instanceof PipelineError) {
    console.error(`paper:publish: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await services.close();
}
