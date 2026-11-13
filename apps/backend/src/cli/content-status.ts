/**
 * content:status: publishes, unpublishes or archives a paper without writing a
 * new version (docs/specs/03-content.md §2). The change is live for learners
 * within a minute (docs/specs/05-api.md §4).
 *
 *   bun run content:status <paper-id> <draft|published|archived>
 */
import { ContentNotFoundError } from "@repo/content";
import { paperStatusSchema, slugSchema } from "@repo/shared";
import { parseArgs } from "node:util";
import { createContentServices } from "../adapters/content";
import { loadConfigOrExit } from "../load-config";

const { positionals } = parseArgs({ allowPositionals: true, strict: true });

const paperId = slugSchema.safeParse(positionals[0]);
const status = paperStatusSchema.safeParse(positionals[1]);
if (positionals.length !== 2 || !paperId.success || !status.success) {
  console.error("Usage: bun run content:status <paper-id> <draft|published|archived>");
  process.exit(2);
}

const config = loadConfigOrExit();
const services = createContentServices(config);
try {
  const entry = await services.store.setPaperStatus(paperId.data, status.data);
  console.log(
    `content:status: ${entry.id} is ${entry.status} (live version v${entry.version})`,
  );
} catch (error) {
  if (error instanceof ContentNotFoundError) {
    console.error(`content:status: ${error.message}.`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await services.close();
}
