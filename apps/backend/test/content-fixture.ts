import {
  ContentStore,
  createProcessLock,
  createReadOnlyLock,
  readContentLibrary,
  syncLibrary,
} from "@repo/content";
import {
  baseLibrary,
  CANARY,
  helpersWithCanary,
  problemFiles,
  writeLibrary,
  type LibrarySpec,
} from "@repo/content/testing";
import { FsStorage } from "@repo/storage";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export { CANARY };

/**
 * The shared two-paper library, plus a second problem with helpers and a
 * tutorial in `rectifier-networks`. Every private part carries the canary.
 */
export function catalogueLibrary(): LibrarySpec {
  const files = baseLibrary();
  const second = problemFiles({
    "problem.yaml": `title: Clipped rectifier
summary: Clip below a threshold using the helper.
difficulty: medium
type: micro
entry_point: relu
environment: numpy
allowed_packages: [numpy]
prohibited_imports: [torch]
time_limit_seconds: 2
memory_limit_mb: 256
paper_refs: [Section 2]
`,
    "tutorial.md": "Start from the helper's signature.\n",
    "helpers.py": helpersWithCanary,
  });
  for (const [path, content] of Object.entries(second)) {
    files[`papers/rectifier-networks/problems/02-clipped/${path}`] = content;
  }
  return files;
}

export interface SyncedContent {
  /** What the API serves from. */
  reader: ContentStore;
  /** For changing content during a test, as the commands would. */
  writer: ContentStore;
  /** Re-syncs a changed library into the same storage. */
  resync(spec: LibrarySpec): Promise<void>;
  cleanup(): Promise<void>;
}

/** Syncs `spec` into a fresh temporary fs storage. */
export async function syncedContent(
  spec: LibrarySpec = catalogueLibrary(),
): Promise<SyncedContent> {
  const dir = await mkdtemp(join(tmpdir(), "backend-content-"));
  const storage = new FsStorage({ root: dir });
  const writer = new ContentStore({ storage, lock: createProcessLock(), indexTtlMs: 0 });
  const reader = new ContentStore({ storage, lock: createReadOnlyLock(), indexTtlMs: 0 });
  const libraries: (() => Promise<void>)[] = [];

  async function resync(next: LibrarySpec) {
    const { root, cleanup } = await writeLibrary(next);
    libraries.push(cleanup);
    await syncLibrary(writer, await readContentLibrary(root));
  }
  await resync(spec);

  return {
    reader,
    writer,
    resync,
    cleanup: async () => {
      await Promise.all(libraries.map((cleanup) => cleanup()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}
