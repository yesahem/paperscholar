/**
 * content:export: writes a paper's live version from content storage to the
 * file format, replacing <content>/papers/<paper-id>/ (docs/specs/03-content.md §7).
 *
 *   bun run content:export <paper-id> [--content <dir>]
 */
import { ContentNotFoundError, exportPaper } from "@repo/content";
import { slugSchema } from "@repo/shared";
import { parseArgs } from "node:util";
import { createContentServices } from "../adapters/content";
import { loadConfigOrExit } from "../load-config";
import { DEFAULT_CONTENT_ROOT } from "./paths";

const { values: args, positionals } = parseArgs({
  options: { content: { type: "string", default: DEFAULT_CONTENT_ROOT } },
  allowPositionals: true,
  strict: true,
});

const paperId = slugSchema.safeParse(positionals[0]);
if (positionals.length !== 1 || !paperId.success) {
  console.error("Usage: bun run content:export <paper-id> [--content <dir>]");
  process.exit(2);
}

const config = loadConfigOrExit();
const services = createContentServices(config);
try {
  const directory = await exportPaper(services.store, paperId.data, args.content);
  console.log(`content:export: wrote ${paperId.data} to ${directory}`);
} catch (error) {
  if (error instanceof ContentNotFoundError) {
    console.error(`content:export: ${error.message}.`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await services.close();
}
