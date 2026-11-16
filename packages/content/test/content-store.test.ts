import { afterEach, describe, expect, test } from "bun:test";
import { FsStorage } from "@repo/storage";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ContentNotFoundError,
  ContentReadOnlyError,
  ContentStore,
  createProcessLock,
  createReadOnlyLock,
  readContentLibrary,
  syncLibrary,
  TracksConflictError,
} from "../src";
import { baseLibrary, writeLibrary } from "../src/testing";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function syncedStorage() {
  const dir = await mkdtemp(join(tmpdir(), "content-store-"));
  const { root, cleanup } = await writeLibrary(baseLibrary());
  cleanups.push(() => rm(dir, { recursive: true, force: true }), cleanup);
  const storage = new FsStorage({ root: dir });
  const writer = new ContentStore({ storage, lock: createProcessLock(), indexTtlMs: 0 });
  await syncLibrary(writer, await readContentLibrary(root));
  return { storage, writer };
}

describe("ContentStore.setPaperStatus", () => {
  test("changes the status without writing a version", async () => {
    const { writer } = await syncedStorage();
    const before = await writer.getEntry("second-paper");

    const entry = await writer.setPaperStatus("second-paper", "archived");

    expect(entry.status).toBe("archived");
    expect(entry.version).toBe(before?.version ?? -1);
    expect(entry.latestVersion).toBe(before?.latestVersion ?? -1);
    expect((await writer.getIndex({ fresh: true })).papers[1]?.status).toBe("archived");
  });

  test("records the first publication only", async () => {
    const { writer } = await syncedStorage();
    const published = await writer.getEntry("second-paper");
    await writer.setPaperStatus("second-paper", "draft");
    const again = await writer.setPaperStatus("second-paper", "published", {
      by: "maintainer-1",
    });
    expect(again.publishedAt).toBe(published?.publishedAt ?? "missing");
    expect(again.publishedBy).toBeNull();
  });

  test("an unknown paper is not found", async () => {
    const { writer } = await syncedStorage();
    await expect(writer.setPaperStatus("missing-paper", "draft")).rejects.toBeInstanceOf(
      ContentNotFoundError,
    );
  });
});

describe("a read-only store", () => {
  test("reads content and refuses every write", async () => {
    const { storage } = await syncedStorage();
    const reader = new ContentStore({ storage, lock: createReadOnlyLock() });

    expect((await reader.getIndex()).papers).toHaveLength(2);
    await expect(reader.setPaperStatus("second-paper", "draft")).rejects.toBeInstanceOf(
      ContentReadOnlyError,
    );
    await expect(reader.replaceTracks(1, [])).rejects.toBeInstanceOf(
      ContentReadOnlyError,
    );
    await expect(reader.syncLibraryTracks([], "x")).rejects.toBeInstanceOf(
      ContentReadOnlyError,
    );
  });

  test("sees another process's change once its cache expires", async () => {
    const { storage, writer } = await syncedStorage();
    const reader = new ContentStore({
      storage,
      lock: createReadOnlyLock(),
      indexTtlMs: 50,
    });
    expect((await reader.getEntry("second-paper"))?.status).toBe("published");

    await writer.setPaperStatus("second-paper", "draft");
    expect((await reader.getEntry("second-paper"))?.status).toBe("published");

    await Bun.sleep(60);
    expect((await reader.getEntry("second-paper"))?.status).toBe("draft");
  });
});

describe("ContentStore drafts", () => {
  test("a draft is written, read back and deleted without touching the index", async () => {
    const { writer } = await syncedStorage();
    const live = await writer.getEntry("second-paper");
    const doc = await writer.getPublicDoc("second-paper", live?.version ?? 1);
    const privateDoc = await writer.getPrivateDoc("second-paper", live?.version ?? 1);
    const indexBefore = await writer.getIndex({ fresh: true });

    expect(await writer.getDraft("new-paper")).toBeNull();
    const written = await writer.putDraft({
      paperId: "new-paper",
      ingestionId: "0193a1b2-0000-7000-8000-000000000001",
      paper: doc.paper,
      problems: doc.problems,
      privateProblems: privateDoc.problems,
    });

    expect(await writer.hasDraft("new-paper")).toBe(true);
    expect(await writer.getDraft("new-paper")).toEqual(written);
    expect(written.public.problems.map((problem) => problem.id)).toEqual(
      doc.problems.map((problem) => problem.id),
    );
    expect(await writer.getIndex({ fresh: true })).toEqual(indexBefore);

    await writer.deleteDraft("new-paper");
    await writer.deleteDraft("new-paper");
    expect(await writer.getDraft("new-paper")).toBeNull();
  });

  test("public and private problems must match", async () => {
    const { writer } = await syncedStorage();
    const live = await writer.getEntry("second-paper");
    const doc = await writer.getPublicDoc("second-paper", live?.version ?? 1);
    await expect(
      writer.putDraft({
        paperId: "new-paper",
        ingestionId: null,
        paper: doc.paper,
        problems: doc.problems,
        privateProblems: [],
      }),
    ).rejects.toThrow("do not match");
  });
});

describe("tracks", () => {
  const cmsTrack = {
    id: "my-track",
    title: "My track",
    summary: "Made in the CMS.",
    paperIds: ["second-paper"],
  };

  test("a save from the current revision bumps it and makes every track CMS-owned", async () => {
    const { writer } = await syncedStorage();
    const before = await writer.getTracks({ fresh: true });
    expect(before?.revision).toBe(1);
    expect(before?.tracks.every((track) => track.origin === "library")).toBe(true);

    const saved = await writer.replaceTracks(1, [...(before?.tracks ?? []), cmsTrack]);
    expect(saved.revision).toBe(2);
    expect(saved.tracks.every((track) => track.origin === "cms")).toBe(true);
    expect((await writer.getTracks({ fresh: true }))?.tracks).toHaveLength(2);
  });

  test("a save from a stale revision changes nothing", async () => {
    const { writer } = await syncedStorage();
    await writer.replaceTracks(1, [cmsTrack]);
    await expect(writer.replaceTracks(1, [])).rejects.toBeInstanceOf(TracksConflictError);
    const stored = await writer.getTracks({ fresh: true });
    expect(stored?.revision).toBe(2);
    expect(stored?.tracks.map((track) => track.id)).toEqual(["my-track"]);
  });

  test("two simultaneous saves from one revision: one wins, one conflicts", async () => {
    const { writer } = await syncedStorage();
    const results = await Promise.allSettled([
      writer.replaceTracks(1, [cmsTrack]),
      writer.replaceTracks(1, [{ ...cmsTrack, id: "other-track" }]),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  test("syncing again leaves CMS tracks, and a new library track with a taken id is skipped", async () => {
    const { writer } = await syncedStorage();
    const library = (await writer.getTracks({ fresh: true }))?.tracks ?? [];
    const first = library[0];
    if (!first) throw new Error("the base library has a track");
    await writer.replaceTracks(1, [{ ...first, title: "Edited in the CMS" }, cmsTrack]);

    const outcome = await writer.syncLibraryTracks(
      [{ ...first, title: "From the files" }],
      "a-new-hash",
    );
    expect(outcome).toBe("updated");
    const stored = await writer.getTracks({ fresh: true });
    expect(stored?.tracks.map((track) => [track.id, track.title, track.origin])).toEqual([
      [first.id, "Edited in the CMS", "cms"],
      ["my-track", "My track", "cms"],
    ]);
    expect(stored?.revision).toBe(3);
  });

  test("syncing replaces library tracks in place, drops removed ones, and is idempotent", async () => {
    const { writer } = await syncedStorage();
    const library = (await writer.getTracks({ fresh: true }))?.tracks ?? [];
    const first = library[0];
    if (!first) throw new Error("the base library has a track");
    const input = [
      { ...first, title: "Retitled in the files" },
      { id: "added", title: "Added", summary: "New.", paperIds: first.paperIds },
    ];

    expect(await writer.syncLibraryTracks(input, "h2", { dryRun: true })).toBe("updated");
    expect((await writer.getTracks({ fresh: true }))?.revision).toBe(1);

    expect(await writer.syncLibraryTracks(input, "h2")).toBe("updated");
    expect(await writer.syncLibraryTracks(input, "h2")).toBe("unchanged");
    expect(await writer.syncLibraryTracks(input.slice(1), "h3")).toBe("updated");
    const stored = await writer.getTracks({ fresh: true });
    expect(stored?.tracks.map((track) => track.id)).toEqual(["added"]);
  });

  test("a document written before origin and revision existed still reads", async () => {
    const { storage, writer } = await syncedStorage();
    await storage.put(
      "content/tracks.json",
      JSON.stringify({
        schemaVersion: 1,
        sourceHash: "old",
        tracks: [{ id: "legacy", title: "Legacy", summary: "Old.", paperIds: ["a"] }],
      }),
      { contentType: "application/json" },
    );
    const stored = await writer.getTracks({ fresh: true });
    expect(stored?.revision).toBe(0);
    expect(stored?.tracks[0]?.origin).toBe("library");
  });
});
