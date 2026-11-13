import { slugSchema } from "@repo/shared";
import { readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { z } from "zod";
import { hashFiles, type HashableFile } from "../hash";
import { findRawHtml } from "../markdown";
import {
  paperFileSchema,
  problemFileSchema,
  trackFileSchema,
  type PaperFile,
  type ProblemFile,
  type TrackFile,
} from "../schemas/source";
import { ContentValidationError, type ContentIssue } from "./errors";

export interface SourceProblem {
  id: string;
  /** From the folder's numeric prefix: `02-scaled-attention` → 2. */
  order: number;
  meta: ProblemFile;
  description: string;
  tutorial: string | null;
  starter: string;
  solution: string;
  helpers: string | null;
  testsPublic: string;
  testsHidden: string;
  /** Hash over every file of the problem. */
  contentHash: string;
}

export interface SourcePaper {
  id: string;
  meta: PaperFile;
  problems: SourceProblem[];
  /** Hash over every file in the paper's folder. Sync skips unchanged papers. */
  sourceHash: string;
}

export interface SourceTrack {
  id: string;
  meta: TrackFile;
}

export interface ContentLibrary {
  papers: SourcePaper[];
  tracks: SourceTrack[];
  tracksHash: string;
}

const PROBLEM_FOLDER = /^(\d{2})-(.+)$/;
const REQUIRED_PROBLEM_FILES = [
  "problem.yaml",
  "description.md",
  "starter.py",
  "solution.py",
  "tests/test_public.py",
  "tests/test_hidden.py",
] as const;
const OPTIONAL_PROBLEM_FILES = ["tutorial.md", "helpers.py"] as const;
const KNOWN_PROBLEM_FILES = new Set<string>([
  ...REQUIRED_PROBLEM_FILES,
  ...OPTIONAL_PROBLEM_FILES,
]);

/** Every file under `directory`, as `/`-separated paths relative to it. */
async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== ".DS_Store")
    .map((entry) =>
      relative(directory, join(entry.parentPath, entry.name)).split(sep).join("/"),
    )
    .sort();
}

async function listDirectories(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

class LibraryReader {
  readonly issues: ContentIssue[] = [];
  private readonly rootName: string;

  constructor(private readonly root: string) {
    this.rootName = basename(root);
  }

  display(path: string): string {
    const inside = relative(this.root, path).split(sep).join("/");
    return inside ? `${this.rootName}/${inside}` : this.rootName;
  }

  issue(path: string, message: string): void {
    this.issues.push({ file: this.display(path), message });
  }

  async text(path: string): Promise<string | null> {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return file.text();
  }

  /** Parses a YAML file against `schema`, recording every problem. */
  async yaml<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ): Promise<z.output<Schema> | null> {
    const text = await this.text(path);
    if (text === null) {
      this.issue(path, "is missing");
      return null;
    }
    let raw: unknown;
    try {
      raw = Bun.YAML.parse(text);
    } catch (error) {
      this.issue(
        path,
        `is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      for (const problem of parsed.error.issues) {
        this.issue(path, `${problem.path.join(".") || "file"}: ${problem.message}`);
      }
      return null;
    }
    return parsed.data;
  }

  checkSlug(path: string, id: string, what: string): boolean {
    const result = slugSchema.safeParse(id);
    if (!result.success)
      this.issue(
        path,
        `${what} id "${id}" ${result.error.issues[0]?.message ?? "is invalid"}`,
      );
    return result.success;
  }

  checkMarkdown(path: string, markdown: string): void {
    for (const match of findRawHtml(markdown)) {
      this.issue(path, `raw HTML is not allowed (line ${match.line}): ${match.html}`);
    }
  }

  async readProblem(paperDir: string, folder: string): Promise<SourceProblem | null> {
    const directory = join(paperDir, "problems", folder);
    const prefix = PROBLEM_FOLDER.exec(folder);
    if (!prefix?.[1] || !prefix[2]) {
      this.issue(
        directory,
        'problem folders are named "NN-problem-id", e.g. "01-positional-encoding"',
      );
      return null;
    }
    const id = prefix[2];
    if (!this.checkSlug(directory, id, "problem")) return null;

    const files = await listFiles(directory);
    for (const file of files) {
      if (!KNOWN_PROBLEM_FILES.has(file))
        this.issue(join(directory, file), "is not a recognised problem file");
    }
    for (const file of REQUIRED_PROBLEM_FILES) {
      if (!files.includes(file)) this.issue(join(directory, file), "is missing");
    }

    const meta = await this.yaml(join(directory, "problem.yaml"), problemFileSchema);
    const contents: HashableFile[] = [];
    const read = async (file: string) => {
      const content = await this.text(join(directory, file));
      if (content !== null) contents.push({ path: file, content });
      return content;
    };
    const description = await read("description.md");
    const tutorial = await read("tutorial.md");
    const starter = await read("starter.py");
    const solution = await read("solution.py");
    const helpers = await read("helpers.py");
    const testsPublic = await read("tests/test_public.py");
    const testsHidden = await read("tests/test_hidden.py");
    await read("problem.yaml");

    if (description !== null)
      this.checkMarkdown(join(directory, "description.md"), description);
    if (tutorial !== null) this.checkMarkdown(join(directory, "tutorial.md"), tutorial);

    if (
      !meta ||
      description === null ||
      starter === null ||
      solution === null ||
      testsPublic === null ||
      testsHidden === null
    ) {
      return null;
    }
    return {
      id,
      order: Number(prefix[1]),
      meta,
      description,
      tutorial,
      starter,
      solution,
      helpers,
      testsPublic,
      testsHidden,
      contentHash: hashFiles(contents),
    };
  }

  async readPaper(id: string): Promise<SourcePaper | null> {
    const directory = join(this.root, "papers", id);
    if (!this.checkSlug(directory, id, "paper")) return null;

    const meta = await this.yaml(join(directory, "paper.yaml"), paperFileSchema);
    const folders = await listDirectories(join(directory, "problems"));
    if (folders.length === 0) this.issue(directory, "has no problems");

    const problems: SourceProblem[] = [];
    for (const folder of folders) {
      const problem = await this.readProblem(directory, folder);
      if (problem) problems.push(problem);
    }

    const seenIds = new Map<string, string>();
    const seenOrders = new Map<number, string>();
    for (const folder of folders) {
      const prefix = PROBLEM_FOLDER.exec(folder);
      if (!prefix?.[1] || !prefix[2]) continue;
      const folderPath = join(directory, "problems", folder);
      const previousId = seenIds.get(prefix[2]);
      if (previousId) this.issue(folderPath, `repeats the problem id of ${previousId}`);
      const previousOrder = seenOrders.get(Number(prefix[1]));
      if (previousOrder)
        this.issue(folderPath, `repeats the order number of ${previousOrder}`);
      seenIds.set(prefix[2], folder);
      seenOrders.set(Number(prefix[1]), folder);
    }

    const paperFiles = await listFiles(directory);
    const contents = await Promise.all(
      paperFiles.map(async (path) => ({
        path,
        content: await Bun.file(join(directory, path)).text(),
      })),
    );

    if (!meta) return null;
    return {
      id,
      meta,
      problems: problems.sort((a, b) => a.order - b.order),
      sourceHash: hashFiles(contents),
    };
  }

  async readTracks(
    paperIds: ReadonlySet<string>,
  ): Promise<{ tracks: SourceTrack[]; hash: string }> {
    const directory = join(this.root, "tracks");
    let files: string[] = [];
    try {
      files = (await readdir(directory)).filter((name) => !name.startsWith(".")).sort();
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        throw error;
    }

    const tracks: SourceTrack[] = [];
    const contents: HashableFile[] = [];
    for (const file of files) {
      const path = join(directory, file);
      if (!file.endsWith(".yaml")) {
        this.issue(path, "tracks are .yaml files");
        continue;
      }
      const id = file.slice(0, -".yaml".length);
      if (!this.checkSlug(path, id, "track")) continue;
      const meta = await this.yaml(path, trackFileSchema);
      contents.push({ path: file, content: (await this.text(path)) ?? "" });
      if (!meta) continue;
      for (const paperId of meta.papers) {
        if (!paperIds.has(paperId))
          this.issue(path, `refers to unknown paper "${paperId}"`);
      }
      tracks.push({ id, meta });
    }
    return { tracks, hash: hashFiles(contents) };
  }
}

/**
 * Reads and validates a content folder (docs/specs/03-content.md §6). Throws
 * ContentValidationError listing every problem found, each with its file.
 */
export async function readContentLibrary(root: string): Promise<ContentLibrary> {
  const directory = resolve(root);
  const reader = new LibraryReader(directory);
  if (!(await listDirectories(join(directory, ".."))).includes(basename(directory))) {
    throw new ContentValidationError([
      { file: reader.display(directory), message: "does not exist" },
    ]);
  }

  const papers: SourcePaper[] = [];
  for (const id of await listDirectories(join(directory, "papers"))) {
    const paper = await reader.readPaper(id);
    if (paper) papers.push(paper);
  }
  const { tracks, hash } = await reader.readTracks(
    new Set(papers.map((paper) => paper.id)),
  );

  if (reader.issues.length > 0) throw new ContentValidationError(reader.issues);
  return { papers, tracks, tracksHash: hash };
}
