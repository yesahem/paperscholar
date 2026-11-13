/**
 * content:sync: publishes the repository's content library to content storage
 * (docs/specs/03-content.md §7). Only papers whose files changed get a new
 * version; papers made on this instance are never touched.
 *
 *   bun run content:sync [--content <dir>] [--dry-run]
 *
 * Exit code 0 on success (conflicts are reported, not fatal), 1 on failure,
 * 2 when the content folder is invalid.
 */
import { ContentValidationError, readContentLibrary, syncLibrary } from "@repo/content";
import { parseArgs } from "node:util";
import { createContentServices, describeStorage } from "../adapters/content";
import { loadConfigOrExit } from "../load-config";
import { DEFAULT_CONTENT_ROOT } from "./paths";

const { values: args } = parseArgs({
  options: {
    content: { type: "string", default: DEFAULT_CONTENT_ROOT },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

const config = loadConfigOrExit();

let library;
try {
  library = await readContentLibrary(args.content);
} catch (error) {
  if (error instanceof ContentValidationError) {
    console.error(error.message);
    process.exit(2);
  }
  throw error;
}

const services = createContentServices(config);
try {
  const report = await syncLibrary(services.store, library, { dryRun: args["dry-run"] });
  console.log(
    `content:sync${report.dryRun ? " (dry run)" : ""}: ${library.papers.length} paper(s) → ${describeStorage(config)}`,
  );
  for (const id of report.created) console.log(`  created    ${id}`);
  for (const id of report.updated) console.log(`  updated    ${id}`);
  for (const id of report.unchanged) console.log(`  unchanged  ${id}`);
  for (const { paperId, problemIds } of report.retired) {
    console.log(`  retired    ${paperId}: ${problemIds.join(", ")}`);
  }
  for (const { paperId, reason } of report.conflicts) {
    console.log(`  conflict   ${paperId}: ${reason}`);
  }
  console.log(`  tracks     ${report.tracks}`);
} finally {
  await services.close();
}
