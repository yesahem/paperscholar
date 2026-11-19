import { PreconditionFailedError, type ObjectStorage } from "@repo/storage";
import type { ContentSource, PaperStatus } from "@repo/shared";
import type { z } from "zod";
import {
  contentIndexSchema,
  paperDraftPrivateDocSchema,
  paperDraftPublicDocSchema,
  paperPrivateDocSchema,
  paperPublicDocSchema,
  tracksDocSchema,
  type ContentIndex,
  type IndexEntry,
  type PaperDraftPrivateDoc,
  type PaperDraftPublicDoc,
  type PaperMetadata,
  type PaperPrivateDoc,
  type PaperPublicDoc,
  type StoredProblemPrivate,
  type StoredProblemPublic,
  type StoredTrack,
  type TracksDoc,
} from "../schemas/stored";
import {
  ContentConcurrencyError,
  ContentCorruptError,
  ContentNotFoundError,
  TracksConflictError,
} from "./errors";
import {
  CONTENT_INDEX_KEY,
  indexHistoryKey,
  paperDraftKey,
  paperVersionKey,
  TRACKS_KEY,
  type DocumentPart,
} from "./keys";
import { ExamStore } from "./exam-store";
import type { IndexLock } from "./lock";
import { LruCache } from "./lru-cache";

const JSON_TYPE = "application/json";
/** How far past `latestVersion` to look for a free number after interrupted publishes. */
const MAX_ORPHANED_VERSIONS = 50;

export interface ContentStoreOptions {
  storage: ObjectStorage;
  lock: IndexLock;
  now?: () => Date;
  /** How long a cached index or tracks document is trusted before revalidating. @default 30000 */
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

export interface DraftInput {
  paperId: string;
  ingestionId: string | null;
  paper: PaperMetadata;
  problems: StoredProblemPublic[];
  privateProblems: StoredProblemPrivate[];
}

export interface PaperDraft {
  public: PaperDraftPublicDoc;
  private: PaperDraftPrivateDoc;
}

interface CachedIndex {
  index: ContentIndex;
  etag: string | null;
  fetchedAt: number;
}

interface CachedTracks {
  doc: TracksDoc | null;
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

function assertMatchingProblems(
  paperId: string,
  problems: readonly StoredProblemPublic[],
  privateProblems: readonly StoredProblemPrivate[],
): void {
  const publicIds = problems.map((problem) => problem.id).join(",");
  const privateIds = privateProblems.map((problem) => problem.id).join(",");
  if (publicIds !== privateIds) {
    throw new Error(`Public and private problems of ${paperId} do not match`);
  }
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
  private cachedTracks: CachedTracks | null = null;
  private readonly publicDocs: LruCache<PaperPublicDoc>;
  private readonly privateDocs: LruCache<PaperPrivateDoc>;
  /** Quiz sets, in the same storage and under the same lock (docs/specs/10-secondary-features.md §1). */
  readonly exams: ExamStore;

  constructor(options: ContentStoreOptions) {
    this.storage = options.storage;
    this.lock = options.lock;
    this.now = options.now ?? (() => new Date());
    this.indexTtlMs = options.indexTtlMs ?? 30_000;
    this.publicDocs = new LruCache(options.maxCachedDocuments ?? 200);
    this.privateDocs = new LruCache(options.maxCachedDocuments ?? 200);
    this.exams = new ExamStore({
      storage: this.storage,
      lock: this.lock,
      now: this.now,
      indexTtlMs: this.indexTtlMs,
    });
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
    assertMatchingProblems(input.paperId, input.problems, input.privateProblems);

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

  /**
   * Changes a paper's status without writing a new version. The first move to
   * `published` records when and by whom.
   */
  async setPaperStatus(
    paperId: string,
    status: PaperStatus,
    { by = null }: { by?: string | null } = {},
  ): Promise<IndexEntry> {
    return this.lock.withLock(async () => {
      const snapshot = await this.readIndexForWrite();
      const existing = snapshot.index.papers.find((entry) => entry.id === paperId);
      if (!existing) throw new ContentNotFoundError(`Paper ${paperId}`);
      if (existing.status === status) return existing;

      const now = this.now().toISOString();
      const firstPublish = status === "published" && existing.publishedAt === null;
      const entry: IndexEntry = {
        ...existing,
        status,
        publishedAt: firstPublish ? now : existing.publishedAt,
        publishedBy: firstPublish ? by : existing.publishedBy,
        updatedAt: now,
      };
      await this.commitIndex(snapshot, entry);
      return entry;
    });
  }

  /**
   * Writes or replaces a paper's draft (docs/specs/03-content.md §3). Drafts
   * are never cached and never served to learners. The private part is written
   * first, so a draft whose public part exists is complete.
   */
  async putDraft(input: DraftInput): Promise<PaperDraft> {
    assertMatchingProblems(input.paperId, input.problems, input.privateProblems);
    const draft: PaperDraft = {
      private: paperDraftPrivateDocSchema.parse({
        schemaVersion: 1,
        paperId: input.paperId,
        problems: input.privateProblems,
      }),
      public: paperDraftPublicDocSchema.parse({
        schemaVersion: 1,
        paperId: input.paperId,
        ingestionId: input.ingestionId,
        updatedAt: this.now().toISOString(),
        paper: input.paper,
        problems: input.problems,
      }),
    };
    await this.storage.put(
      paperDraftKey(input.paperId, "private"),
      JSON.stringify(draft.private),
      { contentType: JSON_TYPE },
    );
    await this.storage.put(
      paperDraftKey(input.paperId, "public"),
      JSON.stringify(draft.public),
      { contentType: JSON_TYPE },
    );
    return draft;
  }

  /** The paper's draft, or null when it has none. */
  async getDraft(paperId: string): Promise<PaperDraft | null> {
    const publicKey = paperDraftKey(paperId, "public");
    const publicObject = await this.storage.get(publicKey);
    if (!publicObject) return null;
    const privateKey = paperDraftKey(paperId, "private");
    const privateObject = await this.storage.get(privateKey);
    if (!privateObject)
      throw new ContentCorruptError(privateKey, "missing beside its public part");
    return {
      public: parseJson(publicKey, publicObject.body, paperDraftPublicDocSchema),
      private: parseJson(privateKey, privateObject.body, paperDraftPrivateDocSchema),
    };
  }

  /** Whether a draft exists under this paper id. */
  async hasDraft(paperId: string): Promise<boolean> {
    return (await this.storage.head(paperDraftKey(paperId, "public"))) !== null;
  }

  /** Deletes a draft. Deleting a missing draft is not an error. */
  async deleteDraft(paperId: string): Promise<void> {
    await this.storage.delete(paperDraftKey(paperId, "public"));
    await this.storage.delete(paperDraftKey(paperId, "private"));
  }

  /** Learning tracks, cached like the index. `fresh` bypasses the cache. */
  async getTracks({
    fresh = false,
  }: { fresh?: boolean } = {}): Promise<TracksDoc | null> {
    const cached = this.cachedTracks;
    if (!fresh && cached && Date.now() - cached.fetchedAt < this.indexTtlMs)
      return cached.doc;
    const object = await this.storage.get(TRACKS_KEY);
    const doc = object ? parseJson(TRACKS_KEY, object.body, tracksDocSchema) : null;
    this.cachedTracks = { doc, fetchedAt: Date.now() };
    return doc;
  }

  /** The stored document read straight from storage, for writers holding the lock. */
  private async readTracksUncached(): Promise<TracksDoc | null> {
    const object = await this.storage.get(TRACKS_KEY);
    return object ? parseJson(TRACKS_KEY, object.body, tracksDocSchema) : null;
  }

  private async writeTracks(doc: TracksDoc): Promise<TracksDoc> {
    const valid = tracksDocSchema.parse(doc);
    await this.storage.put(TRACKS_KEY, JSON.stringify(valid), {
      contentType: JSON_TYPE,
    });
    this.cachedTracks = { doc: valid, fetchedAt: Date.now() };
    return valid;
  }

  /**
   * A maintainer's save of the whole track list (docs/specs/14-cms.md §7.3).
   * Under the content lock: refused with `TracksConflictError` unless the
   * stored document is still at `expectedRevision`. Every track saved here is
   * owned by the CMS from now on, so `content:sync` leaves it alone.
   */
  async replaceTracks(
    expectedRevision: number,
    tracks: readonly Omit<StoredTrack, "origin">[],
  ): Promise<TracksDoc> {
    return this.lock.withLock(async () => {
      const current = await this.readTracksUncached();
      const revision = current?.revision ?? 0;
      if (revision !== expectedRevision) {
        throw new TracksConflictError(expectedRevision, revision);
      }
      return this.writeTracks({
        schemaVersion: 1,
        sourceHash: current?.sourceHash ?? "",
        revision: revision + 1,
        tracks: tracks.map((track) => ({ ...track, origin: "cms" })),
      });
    });
  }

  /**
   * Brings the repository's tracks into storage (`content:sync`), leaving
   * every CMS-owned track exactly as it is. Library tracks are replaced in
   * place, dropped when the files no longer have them, and new ones are
   * appended unless a CMS track already has the id.
   */
  async syncLibraryTracks(
    library: readonly Omit<StoredTrack, "origin">[],
    sourceHash: string,
    { dryRun = false }: { dryRun?: boolean } = {},
  ): Promise<"created" | "updated" | "unchanged"> {
    return this.lock.withLock(async () => {
      const current = await this.readTracksUncached();
      const fresh = new Map(library.map((track) => [track.id, track]));
      const kept: StoredTrack[] = [];
      for (const track of current?.tracks ?? []) {
        if (track.origin === "cms") {
          kept.push(track);
          continue;
        }
        const replacement = fresh.get(track.id);
        if (replacement) kept.push({ ...replacement, origin: "library" });
      }
      const present = new Set(kept.map((track) => track.id));
      for (const track of library) {
        if (!present.has(track.id)) kept.push({ ...track, origin: "library" });
      }
      const unchanged =
        current !== null &&
        current.sourceHash === sourceHash &&
        JSON.stringify(current.tracks) === JSON.stringify(kept);
      if (unchanged) return "unchanged";
      if (!dryRun) {
        await this.writeTracks({
          schemaVersion: 1,
          sourceHash,
          revision: (current?.revision ?? 0) + 1,
          tracks: kept,
        });
      }
      return current ? "updated" : "created";
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
