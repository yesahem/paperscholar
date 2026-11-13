/**
 * content:verify: proves every problem in the content folder works
 * (docs/specs/03-content.md §8, checks V1–V6 and V10).
 *
 *   bun run content:verify [--content <dir>] [--paper <id>] [--concurrency <n>]
 *
 * Uses the local runner, so it needs the Python environment from
 * `bun run runner:setup` (or RUNNER_PYTHON). Exit code 0 when every problem
 * passes, 1 when any fails, 2 when the content folder itself is invalid.
 */
import { ContentValidationError, readContentLibrary } from "@repo/content";
import { defaultLocalPythonPath, LocalProvider } from "@repo/runner";
import { EnvError, parseEnv } from "@repo/shared";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { verifiableFromSource } from "../verify/from-source";
import type { VerifiableProblem, VerificationReport } from "../verify/types";
import { verifyProblem } from "../verify/verify-problem";

const DEFAULT_CONTENT_ROOT = resolve(import.meta.dir, "../../../../content");

const { values: args } = parseArgs({
  options: {
    content: { type: "string", default: DEFAULT_CONTENT_ROOT },
    paper: { type: "string" },
    concurrency: { type: "string", default: "2" },
  },
  strict: true,
});

function readEnv() {
  try {
    return parseEnv(
      z.object({
        NODE_ENV: z.string().optional(),
        RUNNER_PYTHON: z.string().optional(),
      }),
      process.env,
      { app: "content:verify", exampleFile: "packages/pipeline/.env.example" },
    );
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}

async function runPool<Item, Result>(
  items: Item[],
  limit: number,
  worker: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await worker(item);
    }
  });
  await Promise.all(lanes);
  return results;
}

function printReport(report: VerificationReport): void {
  const seconds = (report.durationMs / 1000).toFixed(1);
  console.log(
    `${report.passed ? "✓" : "✗"} ${report.ref}  (${report.runs} runs, ${seconds} s)`,
  );
  for (const check of report.checks) {
    if (check.status === "passed") continue;
    console.log(`    ${check.id} ${check.name}: ${check.status}`);
    for (const detail of check.details) console.log(`        ${detail}`);
  }
}

const env = readEnv();
const concurrency = Number.parseInt(args.concurrency, 10);
if (!Number.isInteger(concurrency) || concurrency < 1) {
  console.error("content:verify: --concurrency must be a positive whole number.");
  process.exit(2);
}

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

const papers = args.paper
  ? library.papers.filter((paper) => paper.id === args.paper)
  : library.papers;
if (args.paper && papers.length === 0) {
  console.error(`content:verify: no paper "${args.paper}" in ${args.content}.`);
  process.exit(2);
}

const problems: VerifiableProblem[] = papers.flatMap((paper) =>
  paper.problems.map((problem) => verifiableFromSource(paper, problem)),
);
const pythonPath = env.RUNNER_PYTHON ?? defaultLocalPythonPath();
const provider = new LocalProvider({ pythonPath, nodeEnv: env.NODE_ENV });

console.log(
  `content:verify: ${papers.length} paper(s), ${problems.length} problem(s), Python ${pythonPath}, concurrency ${concurrency}`,
);
const started = performance.now();
const reports = await runPool(problems, concurrency, async (problem) => {
  const report = await verifyProblem(problem, { provider });
  printReport(report);
  return report;
});

const failed = reports.filter((report) => !report.passed);
console.log(
  `\n${reports.length - failed.length} verified, ${failed.length} failed in ${((performance.now() - started) / 1000).toFixed(1)} s.`,
);
process.exit(failed.length > 0 ? 1 : 0);
