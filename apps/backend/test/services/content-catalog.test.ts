import { ContentStore, createReadOnlyLock } from "@repo/content";
import {
  StorageError,
  type ConditionalGetResult,
  type ObjectInfo,
  type ObjectStorage,
  type PutResult,
  type StoredObject,
} from "@repo/storage";
import { describe, expect, test } from "bun:test";
import { AppError } from "../../src/lib/errors";
import { createContentCatalog } from "../../src/services/content-catalog";

/** Storage whose every call fails, as when R2 is unreachable. */
class UnreachableStorage implements ObjectStorage {
  readonly driver = "r2";
  private fail(): never {
    throw new StorageError("Storage request GET content/index.json failed", {});
  }
  get(): Promise<StoredObject | null> {
    return Promise.resolve().then(() => this.fail());
  }
  getIfChanged(): Promise<ConditionalGetResult> {
    return Promise.resolve().then(() => this.fail());
  }
  head(): Promise<ObjectInfo | null> {
    return Promise.resolve().then(() => this.fail());
  }
  put(): Promise<PutResult> {
    return Promise.resolve().then(() => this.fail());
  }
  delete(): Promise<void> {
    return Promise.resolve().then(() => this.fail());
  }
  list(): AsyncIterable<ObjectInfo> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve().then(() => this.fail()),
      }),
    };
  }
}

describe("createContentCatalog", () => {
  test("reports a storage outage as upstream_unavailable", async () => {
    const catalog = createContentCatalog(
      new ContentStore({ storage: new UnreachableStorage(), lock: createReadOnlyLock() }),
    );
    for (const read of [
      () => catalog.listPapers(),
      () => catalog.getPaper("any-paper"),
      () => catalog.listTracks(),
    ]) {
      const error = await read().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect(error instanceof AppError ? error.code : null).toBe("upstream_unavailable");
    }
  });
});
