import { randomUUID } from "node:crypto";
import { link, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { PreconditionFailedError, StorageError } from "../errors";
import { KeyedMutex } from "../keyed-mutex";
import { assertValidKey, assertValidPrefix, contentTypeForKey } from "../keys";
import type {
  ConditionalGetResult,
  ObjectInfo,
  ObjectStorage,
  PutOptions,
  PutResult,
  StoredObject,
} from "../types";

export interface FsStorageOptions {
  /** Directory that holds every object. Created on first write. */
  root: string;
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/**
 * Stores objects as files under one directory. For local development, tests
 * and self-hosting without an object store.
 *
 * Writes go to a temporary file first and are renamed into place, so readers
 * never see a partial object. Create-once writes use a hard link, which fails
 * atomically if the target exists. Conditional writes are atomic within one
 * process; across processes, callers coordinate with a database lock
 * (docs/specs/03-content.md §2.2).
 */
export class FsStorage implements ObjectStorage {
  readonly driver = "fs";
  private readonly root: string;
  private readonly mutex = new KeyedMutex();

  constructor({ root }: FsStorageOptions) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    assertValidKey(key);
    return join(this.root, ...key.split("/"));
  }

  /** Etag from size and modification time: cheap, and new for every write. */
  private async infoAt(key: string, path: string): Promise<ObjectInfo | null> {
    try {
      const stats = await stat(path, { bigint: true });
      if (!stats.isFile()) return null;
      return {
        key,
        size: Number(stats.size),
        etag: `"${stats.size.toString(16)}-${stats.mtimeNs.toString(16)}"`,
        lastModified: new Date(Number(stats.mtimeMs)),
      };
    } catch (error) {
      if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) return null;
      throw new StorageError(`Could not stat ${key}`, { key }, { cause: error });
    }
  }

  async head(key: string): Promise<ObjectInfo | null> {
    return this.infoAt(key, this.pathFor(key));
  }

  async get(key: string): Promise<StoredObject | null> {
    const path = this.pathFor(key);
    const info = await this.infoAt(key, path);
    if (!info) return null;
    try {
      const body = new Uint8Array(await Bun.file(path).arrayBuffer());
      return {
        ...info,
        size: body.byteLength,
        contentType: contentTypeForKey(key),
        body,
      };
    } catch (error) {
      if (isErrno(error, "ENOENT")) return null;
      throw new StorageError(`Could not read ${key}`, { key }, { cause: error });
    }
  }

  async getIfChanged(key: string, etag: string): Promise<ConditionalGetResult> {
    const info = await this.head(key);
    if (!info) return { status: "not-found" };
    if (info.etag === etag) return { status: "not-modified" };
    const object = await this.get(key);
    return object ? { status: "found", object } : { status: "not-found" };
  }

  async put(
    key: string,
    body: string | Uint8Array,
    options: PutOptions = {},
  ): Promise<PutResult> {
    const path = this.pathFor(key);
    return this.mutex.run(key, async () => {
      if (options.ifMatch !== undefined) {
        const current = await this.infoAt(key, path);
        if (!current || current.etag !== options.ifMatch) {
          throw new PreconditionFailedError(key);
        }
      }

      const directory = dirname(path);
      const temporary = join(directory, `.tmp-${randomUUID()}`);
      try {
        await mkdir(directory, { recursive: true });
        await Bun.write(temporary, body);
        if (options.ifNoneMatch === "*") {
          try {
            await link(temporary, path);
          } catch (error) {
            if (isErrno(error, "EEXIST")) throw new PreconditionFailedError(key);
            throw error;
          }
        } else {
          await rename(temporary, path);
        }
      } catch (error) {
        if (error instanceof StorageError) throw error;
        throw new StorageError(`Could not write ${key}`, { key }, { cause: error });
      } finally {
        await rm(temporary, { force: true });
      }

      const info = await this.infoAt(key, path);
      if (!info) throw new StorageError(`${key} vanished after writing`, { key });
      return { etag: info.etag };
    });
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    await this.mutex.run(key, () => rm(path, { force: true }));
  }

  async *list(prefix: string): AsyncIterable<ObjectInfo> {
    assertValidPrefix(prefix);
    let entries;
    try {
      entries = await readdir(this.root, { recursive: true, withFileTypes: true });
    } catch (error) {
      if (isErrno(error, "ENOENT")) return;
      throw new StorageError("Could not list objects", {}, { cause: error });
    }

    const keys = entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(this.root, join(entry.parentPath, entry.name)).split(sep).join("/"),
      )
      // Skip temporary files and anything else that is not a valid key.
      .filter(
        (key) => key.startsWith(prefix) && !key.split("/").some((s) => s.startsWith(".")),
      )
      .sort();

    for (const key of keys) {
      const info = await this.infoAt(key, join(this.root, ...key.split("/")));
      if (info) yield info;
    }
  }
}
