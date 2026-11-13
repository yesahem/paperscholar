import { PreconditionFailedError, type ObjectStorage } from "@repo/storage";
import type { ContentSource, PaperStatus } from "@repo/shared";
import type { z } from "zod";
import {
  contentIndexSchema,
  paperPrivateDocSchema,
  paperPublicDocSchema,
  tracksDocSchema,
  type ContentIndex,
  type IndexEntry,
  type PaperMetadata,
  type PaperPrivateDoc,
  type PaperPublicDoc,
  type StoredProblemPrivate,
  type StoredProblemPublic,
  type TracksDoc,
} from "../schemas/stored";
import {
  ContentConcurrencyError,
  ContentCorruptError,
  ContentNotFoundError,
} from "./errors";
import {
  CONTENT_INDEX_KEY,
  indexHistoryKey,
  paperVersionKey,
  TRACKS_KEY,
  type DocumentPart,
} from "./keys";
import type { IndexLock } from "./lock";
import { LruCache } from "./lru-cache";

const JSON_TYPE = "application/json";
/** How far past `latestVersion` to look for a free number after interrupted publishes. */
const MAX_ORPHANED_VERSIONS = 50;

export interface ContentStoreOptions {
  storage: ObjectStorage;
  lock: IndexLock;
  now?: () => Date;
  /** How long a cached index is trusted before revalidating. @default 30000 */
  indexTtlMs?: number;
  /** Version documents kept in memory. They never change, so caching is safe. @default 200 */
  maxCachedDocuments?: number;
}

export interface PublishInput {
  paperId: string;
  source: ContentSource;
  status: PaperStatus;
  /** Hash of the source files, for repository papers. */
  sourceHash: string | null;
  publishedBy: string | null;
  paper: PaperMetadata;
  problems: StoredProblemPublic[];
  privateProblems: StoredProblemPrivate[];
}

interface CachedIndex {
  index: ContentIndex;
  etag: string | null;
  fetchedAt: number;
}

interface IndexSnapshot {
  index: ContentIndex;
  etag: string | null;
  raw: Uint8Array | null;
}

function emptyIndex(now: Date): ContentIndex {
  return { schemaVersion: 1, updatedAt: now.toISOString(), papers: [] };
}

function parseJson<Schema extends z.ZodType>(
  key: string,
  body: Uint8Array,
  schema: Schema,
): z.output<Schema> {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    throw new ContentCorruptError(key, "not valid JSON", { cause: error });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ContentCorruptError(key, parsed.error.message);
  return parsed.data;
}

/**
 * Paper content in object storage (docs/specs/03-content.md §2).
 *
 * - Version documents are written once and never changed.
 * - `content/index.json` is the commit point: a version is live when the
 *   index points at it. Writers hold the index lock and also write the index
 *   conditionally on its etag; the previous index is kept in index-history/.
 * - Reads go through a small cache: the index is revalidated by etag after
 *   `indexTtlMs`; version documents are cached until evicted.
 */
export class ContentStore {
  private readonly storage: ObjectStorage;
  private readonly lock: IndexLock;
  private readonly now: () => Date;
  private readonly indexTtlMs: number;
  private cachedIndex: CachedIndex | null = null;
  private pendingIndex: Promise<CachedIndex> | null = null;
  private readonly publicDocs: LruCache<PaperPublicDoc>;
  private readonly privateDocs: LruCache<PaperPrivateDoc>;

  constructor(options: ContentStoreOptions) {
    this.storage = options.storage;
    this.lock = options.lock;
    this.now = options.now ?? (() => new Date());
    this.indexTtlMs = options.indexTtlMs ?? 30_000;
    this.publicDocs = new LruCache(options.maxCachedDocuments ?? 200);
    this.privateDocs = new LruCache(options.maxCachedDocuments ?? 200);
  }

  /** The catalogue. `fresh` bypasses the cache (still a conditional read). */
  async getIndex({ fresh = false }: { fresh?: boolean } = {}): Promise<ContentIndex> {
    const cached = this.cachedIndex;
    if (!fresh && cached && Date.now() - cached.fetchedAt < this.indexTtlMs)
      return cached.index;
    this.pendingIndex ??= this.revalidateIndex().finally(() => {
      this.pendingIndex = null;
    });
    return (await this.pendingIndex).index;
  }

  async getEntry(paperId: string): Promise<IndexEntry | null> {
    return (await this.getIndex()).papers.find((entry) => entry.id === paperId) ?? null;
  }

  async getPublicDoc(paperId: string, version: number): Promise<PaperPublicDoc> {
    return this.readDocument(
      paperId,
      version,
      "public",
      paperPublicDocSchema,
      this.publicDocs,
    );
  }

  async getPrivateDoc(paperId: string, version: number): Promise<PaperPrivateDoc> {
    return this.readDocument(
      paperId,
      version,
      "private",
      paperPrivateDocSchema,
      this.privateDocs,
    );
  }

  /**
   * Writes the next version of a paper and makes it live. Versions already
   * written are never touched; an interrupted earlier publish leaves an
   * orphaned version number, which is skipped.
   */
  async publishVersion(input: PublishInput): Promise<IndexEntry> {
    const publicIds = input.problems.map((problem) => problem.id).join(",");
    const privateIds = input.privateProblems.map((problem) => problem.id).join(",");
    if (publicIds !== privateIds) {
      throw new Error(`Public and private problems of ${input.paperId} do not match`);
    }

    return this.lock.withLock(async () => {
      const snapshot = await this.readIndexForWrite();
      const existing = snapshot.index.papers.find((entry) => entry.id === input.paperId);
      const version = await this.writeVersion(input, (existing?.latestVersion ?? 0) + 1);

      const now = this.now().toISOString();
      const isPublished = input.status === "published";
      const entry: IndexEntry = {
        id: input.paperId,
        ...input.paper,
        status: input.status,
        source: input.source,
        version,
        latestVersion: version,
        sourceHash: input.sourceHash,
        publishedAt: existing?.publishedAt ?? (isPublished ? now : null),
        publishedBy: existing?.publishedBy ?? (isPublished ? input.publishedBy : null),
        updatedAt: now,
        problems: input.problems.map(
          ({ id, order, status, title, summary, difficulty, type }) => ({
            id,
            order,
            status,
            title,
            summary,
            difficulty,
            type,
          }),
        ),
      };
      await this.commitIndex(snapshot, entry);
      return entry;
    });
  }

  /** Points a paper back (or forward) at a version that was written earlier. */
  async setLiveVersion(paperId: string, version: number): Promise<IndexEntry> {
    return this.lock.withLock(async () => {
      const snapshot = await this.readIndexForWrite();
      const existing = snapshot.index.papers.find((entry) => entry.id === paperId);
      if (!existing) throw new ContentNotFoundError(`Paper ${paperId}`);
      if (version < 1 || version > existing.latestVersion) {
        throw new ContentNotFoundError(`Version ${version} of ${paperId}`);
      }
      const doc = await this.getPublicDoc(paperId, version);
      const entry: IndexEntry = {
        ...existing,
        ...doc.paper,
        version,
        updatedAt: this.now().toISOString(),
        problems: doc.problems.map(
          ({ id, order, status, title, summary, difficulty, type }) => ({
            id,
            order,
            status,
            title,
            summary,
            difficulty,
            type,
          }),
        ),
      };
      await this.commitIndex(snapshot, entry);
      return entry;
    });
  }

  async getTracks(): Promise<TracksDoc | null> {
    const object = await this.storage.get(TRACKS_KEY);
    return object ? parseJson(TRACKS_KEY, object.body, tracksDocSchema) : null;
  }

  async putTracks(doc: TracksDoc): Promise<void> {
    const valid = tracksDocSchema.parse(doc);
    await this.lock.withLock(async () => {
      await this.storage.put(TRACKS_KEY, JSON.stringify(valid), {
        contentType: JSON_TYPE,
      });
    });
  }

  private async revalidateIndex(): Promise<CachedIndex> {
    const cached = this.cachedIndex;
    if (cached?.etag) {
      const result = await this.storage.getIfChanged(CONTENT_INDEX_KEY, cached.etag);
      if (result.status === "not-modified") {
        this.cachedIndex = { ...cached, fetchedAt: Date.now() };
        return this.cachedIndex;
      }
      if (result.status === "found") {
        const index = parseJson(
          CONTENT_INDEX_KEY,
          result.object.body,
          contentIndexSchema,
        );
        this.cachedIndex = { index, etag: result.object.etag, fetchedAt: Date.now() };
        return this.cachedIndex;
      }
    }
    const snapshot = await this.readIndexSnapshot();
    this.cachedIndex = {
      index: snapshot.index,
      etag: snapshot.etag,
      fetchedAt: Date.now(),
    };
    return this.cachedIndex;
  }

  private async readIndexSnapshot(): Promise<IndexSnapshot> {
    const object = await this.storage.get(CONTENT_INDEX_KEY);
    if (!object) return { index: emptyIndex(this.now()), etag: null, raw: null };
    return {
      index: parseJson(CONTENT_INDEX_KEY, object.body, contentIndexSchema),
      etag: object.etag,
      raw: object.body,
    };
  }

  /** Always reads storage: writers must start from the committed index. */
  private readIndexForWrite(): Promise<IndexSnapshot> {
    return this.readIndexSnapshot();
  }

  private async writeVersion(
    input: PublishInput,
    firstCandidate: number,
  ): Promise<number> {
    for (
      let version = firstCandidate;
      version < firstCandidate + MAX_ORPHANED_VERSIONS;
      version += 1
    ) {
      const privateDoc: PaperPrivateDoc = {
        schemaVersion: 1,
        paperId: input.paperId,
        version,
        problems: input.privateProblems,
      };
      try {
        await this.storage.put(
          paperVersionKey(input.paperId, version, "private"),
          JSON.stringify(paperPrivateDocSchema.parse(privateDoc)),
          { contentType: JSON_TYPE, ifNoneMatch: "*" },
        );
      } catch (error) {
        if (error instanceof PreconditionFailedError) continue;
        throw error;
      }
      const publicDoc: PaperPublicDoc = {
        schemaVersion: 1,
        paperId: input.paperId,
        version,
        paper: input.paper,
        problems: input.problems,
      };
      await this.storage.put(
        paperVersionKey(input.paperId, version, "public"),
        JSON.stringify(paperPublicDocSchema.parse(publicDoc)),
        { contentType: JSON_TYPE, ifNoneMatch: "*" },
      );
      return version;
    }
    throw new Error(
      `No free version number for ${input.paperId} after ${MAX_ORPHANED_VERSIONS} attempts`,
    );
  }

  private async commitIndex(snapshot: IndexSnapshot, entry: IndexEntry): Promise<void> {
    const now = this.now();
    const next: ContentIndex = contentIndexSchema.parse({
      schemaVersion: 1,
      updatedAt: now.toISOString(),
      papers: [
        ...snapshot.index.papers.filter((paper) => paper.id !== entry.id),
        entry,
      ].sort((a, b) => a.id.localeCompare(b.id)),
    });

    if (snapshot.raw) {
      await this.storage.put(
        indexHistoryKey(now, crypto.randomUUID().slice(0, 8)),
        snapshot.raw,
        {
          contentType: JSON_TYPE,
          ifNoneMatch: "*",
        },
      );
    }

    try {
      const { etag } = await this.storage.put(CONTENT_INDEX_KEY, JSON.stringify(next), {
        contentType: JSON_TYPE,
        ...(snapshot.etag ? { ifMatch: snapshot.etag } : { ifNoneMatch: "*" as const }),
      });
      this.cachedIndex = { index: next, etag, fetchedAt: Date.now() };
    } catch (error) {
      if (error instanceof PreconditionFailedError) throw new ContentConcurrencyError();
      throw error;
    }
  }

  private async readDocument<Doc>(
    paperId: string,
    version: number,
    part: DocumentPart,
    schema: z.ZodType<Doc>,
    cache: LruCache<Doc>,
  ): Promise<Doc> {
    const key = paperVersionKey(paperId, version, part);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const object = await this.storage.get(key);
    if (!object)
      throw new ContentNotFoundError(`Version ${version} of ${paperId} (${part})`);
    const doc = parseJson(key, object.body, schema);
    cache.set(key, doc);
    return doc;
  }
}
