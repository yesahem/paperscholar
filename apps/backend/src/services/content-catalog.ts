import {
  ContentNotFoundError,
  type ContentStore,
  type IndexEntry,
  type IndexProblem,
  type StoredProblemPublic,
} from "@repo/content";
import type {
  DifficultyCounts,
  PaperDetail,
  PaperSummary,
  ProblemDetail,
  ProblemSummary,
  Track,
} from "@repo/shared";
import { StorageError } from "@repo/storage";
import { AppError } from "../lib/errors";

/**
 * What learners may read: published papers and their published problems,
 * built from explicit field lists (docs/specs/03-content.md §9). Solutions,
 * tests and helper bodies live in private documents this service never opens.
 */
export interface ContentCatalog {
  listPapers(): Promise<PaperSummary[]>;
  /** Throws `not_found` unless the paper is published. */
  getPaper(paperId: string): Promise<PaperDetail>;
  /** Throws `not_found` unless the paper and the problem are both published. */
  getProblem(paperId: string, problemId: string): Promise<ProblemDetail>;
  listTracks(): Promise<Track[]>;
}

function publishedProblems<Problem extends { status: IndexProblem["status"] }>(
  problems: Problem[],
): Problem[] {
  return problems.filter((problem) => problem.status === "published");
}

function difficultyCounts(problems: IndexProblem[]): DifficultyCounts {
  const counts: DifficultyCounts = { easy: 0, medium: 0, hard: 0 };
  for (const problem of problems) counts[problem.difficulty] += 1;
  return counts;
}

function toPaperSummary(entry: IndexEntry): PaperSummary {
  const problems = publishedProblems(entry.problems);
  return {
    id: entry.id,
    title: entry.title,
    authors: entry.authors,
    year: entry.year,
    summary: entry.summary,
    url: entry.url,
    tags: entry.tags,
    problemCount: problems.length,
    difficultyCounts: difficultyCounts(problems),
  };
}

/** Problems keep their stored order; `order` is the 1-based position among published ones. */
function toProblemSummary(
  problem: Pick<IndexProblem, "id" | "title" | "summary" | "difficulty" | "type">,
  position: number,
): ProblemSummary {
  return {
    id: problem.id,
    title: problem.title,
    summary: problem.summary,
    difficulty: problem.difficulty,
    type: problem.type,
    order: position + 1,
  };
}

function toProblemDetail(
  paperId: string,
  problem: StoredProblemPublic,
  position: number,
): ProblemDetail {
  return {
    ...toProblemSummary(problem, position),
    paperId,
    description: problem.description,
    tutorial: problem.tutorial,
    starter: problem.starter,
    entryPoint: problem.entryPoint,
    environment: problem.environment,
    allowedPackages: problem.allowedPackages,
    prohibitedImports: problem.prohibitedImports,
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    paperRefs: problem.paperRefs,
    helpersInterface: problem.helpersInterface,
  };
}

/** Storage outages become 503; anything else is a bug and stays a 500. */
async function fromStorage<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof StorageError) {
      throw new AppError("upstream_unavailable", { cause: error });
    }
    throw error;
  }
}

const byTitle = (a: PaperSummary, b: PaperSummary) =>
  a.title.localeCompare(b.title, "en", { sensitivity: "base" });

export function createContentCatalog(store: ContentStore): ContentCatalog {
  async function publishedEntry(paperId: string): Promise<IndexEntry> {
    const entry = await fromStorage(() => store.getEntry(paperId));
    if (!entry || entry.status !== "published") throw new AppError("not_found");
    return entry;
  }

  return {
    async listPapers() {
      const index = await fromStorage(() => store.getIndex());
      return index.papers
        .filter((entry) => entry.status === "published")
        .map(toPaperSummary)
        .sort(byTitle);
    },

    async getPaper(paperId) {
      const entry = await publishedEntry(paperId);
      return {
        ...toPaperSummary(entry),
        problems: publishedProblems(entry.problems).map(toProblemSummary),
      };
    },

    async getProblem(paperId, problemId) {
      const entry = await publishedEntry(paperId);
      const position = publishedProblems(entry.problems).findIndex(
        (problem) => problem.id === problemId,
      );
      if (position === -1) throw new AppError("not_found");

      const doc = await fromStorage(() => store.getPublicDoc(paperId, entry.version));
      const problem = doc.problems.find((candidate) => candidate.id === problemId);
      if (!problem) {
        throw new ContentNotFoundError(
          `Problem ${problemId} of ${paperId} v${entry.version}, listed in the index,`,
        );
      }
      return toProblemDetail(paperId, problem, position);
    },

    async listTracks() {
      const [index, tracks] = await Promise.all([
        fromStorage(() => store.getIndex()),
        fromStorage(() => store.getTracks()),
      ]);
      const published = new Set(
        index.papers.filter((entry) => entry.status === "published").map((e) => e.id),
      );
      return (tracks?.tracks ?? [])
        .map((track) => ({
          id: track.id,
          title: track.title,
          summary: track.summary,
          paperIds: track.paperIds.filter((id) => published.has(id)),
        }))
        .filter((track) => track.paperIds.length > 0);
    },
  };
}
