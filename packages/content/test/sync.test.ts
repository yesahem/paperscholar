import { afterEach, describe, expect, test } from "bun:test";
import { FsStorage } from "@repo/storage";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CONTENT_INDEX_KEY,
  ContentConcurrencyError,
  ContentStore,
  createProcessLock,
  exportPaper,
  paperVersionKey,
  readContentLibrary,
  syncLibrary,
  type IndexLock,
} from "../src";
import {
  baseLibrary,
  CANARY,
  problemFiles,
  writeLibrary,
  type LibrarySpec,
} from "../src/testing";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function setup(lock: IndexLock = createProcessLock()) {
  const dir = await mkdtemp(join(tmpdir(), "content-store-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const storage = new FsStorage({ root: dir });
  return { storage, store: new ContentStore({ storage, lock, indexTtlMs: 0 }) };
}

async function library(spec: LibrarySpec) {
  const { root, cleanup } = await writeLibrary(spec);
  cleanups.push(cleanup);
  return { root, library: await readContentLibrary(root) };
}

async function keys(storage: FsStorage, prefix = "content/"): Promise<string[]> {
  const found: string[] = [];
  for await (const info of storage.list(prefix)) found.push(info.key);
  return found;
}

describe("syncLibrary", () => {
  test("publishes every paper as version 1 and the tracks", async () => {
    const { store } = await setup();
    const report = await syncLibrary(store, (await library(baseLibrary())).library);

    expect(report).toMatchObject({
      created: ["rectifier-networks", "second-paper"],
      updated: [],
      tracks: "created",
    });
    const index = await store.getIndex();
    expect(index.papers.map((p) => [p.id, p.version, p.status, p.source])).toEqual([
      ["rectifier-networks", 1, "published", "repo"],
      ["second-paper", 1, "published", "repo"],
    ]);
    expect((await store.getTracks())?.tracks[0]?.paperIds).toEqual([
      "rectifier-networks",
      "second-paper",
    ]);
  });

  test("a second sync of unchanged content writes nothing", async () => {
    const { storage, store } = await setup();
    const { library: lib } = await library(baseLibrary());
    await syncLibrary(store, lib);
    const before = await keys(storage);
    const indexBefore = await storage.head(CONTENT_INDEX_KEY);

    const report = await syncLibrary(store, lib);
    expect(report).toMatchObject({
      created: [],
      updated: [],
      unchanged: ["rectifier-networks", "second-paper"],
      tracks: "unchanged",
    });
    expect(await keys(storage)).toEqual(before);
    expect((await storage.head(CONTENT_INDEX_KEY))?.etag).toBe(indexBefore?.etag ?? "");
  });

  test("a change writes a new version and leaves the old one intact for rollback", async () => {
    const { storage, store } = await setup();
    await syncLibrary(store, (await library(baseLibrary())).library);
    const v1 = await storage.head(paperVersionKey("rectifier-networks", 1, "public"));

    const changed = baseLibrary();
    changed["papers/rectifier-networks/problems/01-relu/description.md"] =
      "Updated description.\n";
    const report = await syncLibrary(store, (await library(changed)).library);

    expect(report).toMatchObject({
      updated: ["rectifier-networks"],
      unchanged: ["second-paper"],
    });
    expect((await store.getEntry("rectifier-networks"))?.version).toBe(2);
    expect(
      (await storage.head(paperVersionKey("rectifier-networks", 1, "public")))?.etag,
    ).toBe(v1?.etag ?? "");
    expect((await keys(storage, "content/index-history/")).length).toBeGreaterThanOrEqual(
      1,
    );

    await store.setLiveVersion("rectifier-networks", 1);
    const live = await store.getEntry("rectifier-networks");
    expect(live).toMatchObject({ version: 1, latestVersion: 2 });
    const restored = await store.getPublicDoc("rectifier-networks", live?.version ?? 0);
    expect(restored.problems[0]?.description).toStartWith("Implement");
  });

  test("a removed problem is kept as retired, with its private parts", async () => {
    const { store } = await setup();
    const spec = baseLibrary();
    for (const [path, content] of Object.entries(problemFiles())) {
      spec[`papers/rectifier-networks/problems/02-leaky-relu/${path}`] = content;
    }
    await syncLibrary(store, (await library(spec)).library);

    const report = await syncLibrary(store, (await library(baseLibrary())).library);
    expect(report.retired).toEqual([
      { paperId: "rectifier-networks", problemIds: ["leaky-relu"] },
    ]);
    const entry = await store.getEntry("rectifier-networks");
    expect(entry?.problems.map((p) => [p.id, p.status])).toEqual([
      ["relu", "published"],
      ["leaky-relu", "retired"],
    ]);
    const privateDoc = await store.getPrivateDoc(
      "rectifier-networks",
      entry?.version ?? 0,
    );
    expect(privateDoc.problems.map((p) => p.id)).toEqual(["relu", "leaky-relu"]);
  });

  test("never touches a paper that did not come from the repository", async () => {
    const { store } = await setup();
    const { library: lib } = await library(baseLibrary());
    const source = lib.papers[0];
    if (!source) throw new Error("fixture has no paper");
    await store.publishVersion({
      paperId: source.id,
      source: "pipeline",
      status: "published",
      sourceHash: null,
      publishedBy: "maintainer-1",
      paper: source.meta,
      problems: [],
      privateProblems: [],
    });

    const report = await syncLibrary(store, lib);
    expect(report.conflicts).toEqual([
      {
        paperId: "rectifier-networks",
        reason: "a pipeline paper with this id already exists on this instance",
      },
    ]);
    expect((await store.getEntry("rectifier-networks"))?.source).toBe("pipeline");
  });

  test("a dry run reports changes without writing", async () => {
    const { storage, store } = await setup();
    const report = await syncLibrary(store, (await library(baseLibrary())).library, {
      dryRun: true,
    });
    expect(report).toMatchObject({
      dryRun: true,
      created: ["rectifier-networks", "second-paper"],
      tracks: "created",
    });
    expect(await keys(storage)).toEqual([]);
  });

  test("private parts never appear in the index or public documents", async () => {
    const { storage, store } = await setup();
    await syncLibrary(store, (await library(baseLibrary())).library);
    const readable = [
      CONTENT_INDEX_KEY,
      paperVersionKey("rectifier-networks", 1, "public"),
      "content/tracks.json",
    ];
    for (const key of readable) {
      const object = await storage.get(key);
      expect(new TextDecoder().decode(object?.body)).not.toContain(CANARY);
    }
    const privateObject = await storage.get(
      paperVersionKey("rectifier-networks", 1, "private"),
    );
    expect(new TextDecoder().decode(privateObject?.body)).toContain(CANARY);
  });
});

describe("ContentStore", () => {
  test("concurrent publishes under the lock both take effect", async () => {
    const { store } = await setup();
    const { library: lib } = await library(baseLibrary());
    await Promise.all(
      lib.papers.map((paper) =>
        store.publishVersion({
          paperId: paper.id,
          source: "repo",
          status: "published",
          sourceHash: paper.sourceHash,
          publishedBy: null,
          paper: paper.meta,
          problems: [],
          privateProblems: [],
        }),
      ),
    );
    expect((await store.getIndex({ fresh: true })).papers.map((p) => p.id)).toEqual([
      "rectifier-networks",
      "second-paper",
    ]);
  });

  test("without the lock, the conditional index write refuses the second writer", async () => {
    const noLock: IndexLock = { withLock: (task) => task() };
    const { store } = await setup(noLock);
    const { library: lib } = await library(baseLibrary());
    await store.publishVersion({
      paperId: "seed",
      source: "manual",
      status: "draft",
      sourceHash: null,
      publishedBy: null,
      paper: lib.papers[0]?.meta ?? {
        title: "",
        authors: [],
        year: null,
        url: "",
        summary: "",
        tags: [],
      },
      problems: [],
      privateProblems: [],
    });
    const results = await Promise.allSettled(
      lib.papers.map((paper) =>
        store.publishVersion({
          paperId: paper.id,
          source: "repo",
          status: "published",
          sourceHash: null,
          publishedBy: null,
          paper: paper.meta,
          problems: [],
          privateProblems: [],
        }),
      ),
    );
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.status === "rejected" && rejected[0].reason).toBeInstanceOf(
      ContentConcurrencyError,
    );
  });

  test("an orphaned version from an interrupted publish is skipped, not overwritten", async () => {
    const { storage, store } = await setup();
    const { library: lib } = await library(baseLibrary());
    await syncLibrary(store, lib);
    await storage.put(
      paperVersionKey("rectifier-networks", 2, "private"),
      '{"orphan":true}',
    );

    const changed = baseLibrary();
    changed["papers/rectifier-networks/problems/01-relu/starter.py"] =
      "def relu(x):\n    pass\n";
    await syncLibrary(store, (await library(changed)).library);
    expect((await store.getEntry("rectifier-networks"))?.version).toBe(3);
    expect(
      new TextDecoder().decode(
        (await storage.get(paperVersionKey("rectifier-networks", 2, "private")))?.body,
      ),
    ).toBe('{"orphan":true}');
  });
});

describe("exportPaper", () => {
  test("round-trips a paper through storage back to the file format", async () => {
    const { store } = await setup();
    const { root: originalRoot, library: original } = await library(baseLibrary());
    await syncLibrary(store, original);

    const { root: exportRoot } = await writeLibrary({});
    cleanups.push(() => rm(join(exportRoot, ".."), { recursive: true, force: true }));
    await exportPaper(store, "rectifier-networks", exportRoot);
    await exportPaper(store, "second-paper", exportRoot);
    const exported = await readContentLibrary(exportRoot);

    const strip = (paper: (typeof original.papers)[number] | undefined) =>
      paper && {
        id: paper.id,
        meta: paper.meta,
        problems: paper.problems.map(({ contentHash: _hash, ...problem }) => problem),
      };
    expect(strip(exported.papers[0])).toEqual(strip(original.papers[0]));

    for (const file of [
      "paper.yaml",
      "problems/01-relu/problem.yaml",
      "problems/01-relu/solution.py",
      "problems/01-relu/description.md",
    ]) {
      const exportedText = await Bun.file(
        join(exportRoot, "papers/rectifier-networks", file),
      ).text();
      const originalText = await Bun.file(
        join(originalRoot, "papers/rectifier-networks", file),
      ).text();
      expect(exportedText).toBe(originalText);
    }
  });
});
