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
    const tracks = await reader.getTracks();
    expect(tracks).not.toBeNull();
    if (tracks) {
      await expect(reader.putTracks(tracks)).rejects.toBeInstanceOf(ContentReadOnlyError);
    }
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
