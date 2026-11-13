import { sql } from "drizzle-orm";
import type { Database } from "./client";

export interface AdvisoryLock {
  withLock<T>(task: () => Promise<T>): Promise<T>;
}

/**
 * A lock shared by every process using this database: a transaction-scoped
 * Postgres advisory lock, released when the transaction ends. Works through
 * transaction-mode poolers. Used to serialise writes to content/index.json
 * (docs/specs/03-content.md §2.2).
 *
 * The task runs while one pooled connection is held, so keep it short.
 */
export function createAdvisoryLock(db: Database, name: string): AdvisoryLock {
  return {
    withLock<T>(task: () => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${name}))`);
        return task();
      });
    },
  };
}
