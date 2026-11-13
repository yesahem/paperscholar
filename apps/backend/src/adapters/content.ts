import { CONTENT_INDEX_LOCK, ContentStore } from "@repo/content";
import { closeDb, createAdvisoryLock, createDb } from "@repo/db";
import { createStorage } from "@repo/storage";
import type { AppConfig } from "../env";

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
