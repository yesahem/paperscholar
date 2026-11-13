import { ContentReadOnlyError } from "./errors";

/** Name of the lock every writer of content/index.json takes. */
export const CONTENT_INDEX_LOCK = "content-index";

/**
 * Serialises writers of content/index.json. Production uses a Postgres
 * advisory lock (`createAdvisoryLock` in @repo/db) so every instance agrees.
 */
export interface IndexLock {
  withLock<T>(task: () => Promise<T>): Promise<T>;
}

/** A lock that holds within one process only. For tests and single-process tools. */
export function createProcessLock(): IndexLock {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    withLock<T>(task: () => Promise<T>): Promise<T> {
      const run = tail.then(task, task);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

/**
 * For processes that only read content, such as the API serving learners.
 * Every write through a store holding this lock fails with ContentReadOnlyError.
 */
export function createReadOnlyLock(): IndexLock {
  return {
    withLock: () => Promise.reject(new ContentReadOnlyError()),
  };
}
