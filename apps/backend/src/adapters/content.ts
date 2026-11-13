import { CONTENT_INDEX_LOCK, ContentStore, createReadOnlyLock } from "@repo/content";
import { closeDb, createAdvisoryLock, createDb } from "@repo/db";
import { createStorage } from "@repo/storage";
import type { AppConfig } from "../env";

/**
 * How long the server trusts its cached copy of content/index.json before
 * revalidating it. Part of the freshness budget in docs/specs/05-api.md §4.
 */
export const SERVER_INDEX_TTL_MS = 10_000;

/**
 * The content store the API serves learners from. Read-only: it needs no
 * database and refuses writes, which go through the commands and, from M6,
 * the maintainer endpoints.
 */
export function createContentReader(config: AppConfig): ContentStore {
  return new ContentStore({
    storage: createStorage(config.storage),
    lock: createReadOnlyLock(),
    indexTtlMs: SERVER_INDEX_TTL_MS,
  });
}

export interface ContentServices {
  store: ContentStore;
  /** Releases database connections. Call before a command exits. */
  close(): Promise<void>;
}

/**
 * The content store over the configured storage driver. Writers are serialised
 * with a Postgres advisory lock, so this needs DATABASE_URL.
 */
export function createContentServices(config: AppConfig): ContentServices {
  if (!config.databaseUrl) {
    throw new Error(
      "DATABASE_URL is required: writes to content storage are serialised with a database lock.",
    );
  }
  const db = createDb({ url: config.databaseUrl, maxConnections: 2 });
  const store = new ContentStore({
    storage: createStorage(config.storage),
    lock: createAdvisoryLock(db, CONTENT_INDEX_LOCK),
  });
  return { store, close: () => closeDb(db) };
}

/** One line describing where content lives, for command output. */
export function describeStorage(config: AppConfig): string {
  return config.storage.driver === "fs"
    ? `fs (${config.storage.root})`
    : `r2 (bucket ${config.storage.bucket})`;
}
