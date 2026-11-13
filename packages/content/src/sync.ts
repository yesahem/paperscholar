import { toStoredProblem } from "./build-documents";
import type {
  StoredProblemPrivate,
  StoredProblemPublic,
  TracksDoc,
} from "./schemas/stored";
import type { ContentLibrary, SourcePaper } from "./source/read-library";
import type { ContentStore } from "./store/content-store";

export interface SyncConflict {
  paperId: string;
  reason: string;
}

export interface SyncReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  conflicts: SyncConflict[];
  /** Problems kept as `retired` because their files were removed. */
  retired: { paperId: string; problemIds: string[] }[];
  tracks: "created" | "updated" | "unchanged";
  dryRun: boolean;
}

export interface SyncOptions {
  /** Report what would change without writing anything. */
  dryRun?: boolean;
}

interface PreparedPaper {
  problems: StoredProblemPublic[];
  privateProblems: StoredProblemPrivate[];
  retiredIds: string[];
}

/**
 * Builds the next version's problems. A problem whose files were removed is
 * carried over as `retired`, never dropped, so users who solved it keep their
 * history (docs/specs/03-content.md §7).
 */
async function preparePaper(
  store: ContentStore,
  paper: SourcePaper,
  liveVersion: number | null,
): Promise<PreparedPaper> {
  const problems: StoredProblemPublic[] = [];
  const privateProblems: StoredProblemPrivate[] = [];
  for (const problem of paper.problems) {
    const stored = toStoredProblem(problem);
    problems.push(stored.public);
    privateProblems.push(stored.private);
  }

  const retiredIds: string[] = [];
  if (liveVersion !== null) {
    const current = new Set(problems.map((problem) => problem.id));
    const [previousPublic, previousPrivate] = await Promise.all([
      store.getPublicDoc(paper.id, liveVersion),
      store.getPrivateDoc(paper.id, liveVersion),
    ]);
    for (const previous of previousPublic.problems) {
      if (current.has(previous.id)) continue;
      const privatePart = previousPrivate.problems.find(
        (problem) => problem.id === previous.id,
      );
      if (!privatePart) continue;
      problems.push({ ...previous, status: "retired" });
      privateProblems.push(privatePart);
      if (previous.status !== "retired") retiredIds.push(previous.id);
    }
  }

  const order = (a: StoredProblemPublic, b: StoredProblemPublic) =>
    a.order - b.order || a.id.localeCompare(b.id);
  problems.sort(order);
  const position = new Map(problems.map((problem, index) => [problem.id, index]));
  privateProblems.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  return { problems, privateProblems, retiredIds };
}

/**
 * Publishes the repository's content library to storage. Only papers whose
 * source files changed get a new version; papers not created from the
 * repository are never touched (docs/specs/03-content.md §7).
 */
export async function syncLibrary(
  store: ContentStore,
  library: ContentLibrary,
  { dryRun = false }: SyncOptions = {},
): Promise<SyncReport> {
  const report: SyncReport = {
    created: [],
    updated: [],
    unchanged: [],
    conflicts: [],
    retired: [],
    tracks: "unchanged",
    dryRun,
  };
  const index = await store.getIndex({ fresh: true });

  for (const paper of library.papers) {
    const existing = index.papers.find((entry) => entry.id === paper.id);
    if (existing && existing.source !== "repo") {
      report.conflicts.push({
        paperId: paper.id,
        reason: `a ${existing.source} paper with this id already exists on this instance`,
      });
      continue;
    }
    if (existing?.sourceHash === paper.sourceHash) {
      report.unchanged.push(paper.id);
      continue;
    }

    const prepared = await preparePaper(store, paper, existing?.version ?? null);
    if (prepared.retiredIds.length > 0) {
      report.retired.push({ paperId: paper.id, problemIds: prepared.retiredIds });
    }
    (existing ? report.updated : report.created).push(paper.id);
    if (dryRun) continue;

    await store.publishVersion({
      paperId: paper.id,
      source: "repo",
      status: "published",
      sourceHash: paper.sourceHash,
      publishedBy: null,
      paper: { ...paper.meta, year: paper.meta.year },
      problems: prepared.problems,
      privateProblems: prepared.privateProblems,
    });
  }

  const tracks: TracksDoc = {
    schemaVersion: 1,
    sourceHash: library.tracksHash,
    tracks: library.tracks.map((track) => ({
      id: track.id,
      title: track.meta.title,
      summary: track.meta.summary,
      paperIds: track.meta.papers,
    })),
  };
  const existingTracks = await store.getTracks({ fresh: true });
  if (existingTracks?.sourceHash !== tracks.sourceHash) {
    report.tracks = existingTracks ? "updated" : "created";
    if (!dryRun) await store.putTracks(tracks);
  }

  return report;
}
