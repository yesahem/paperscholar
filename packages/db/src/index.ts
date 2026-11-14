export {
  closeDb,
  createDb,
  type Database,
  type DatabaseOptions,
  type Transaction,
} from "./client";
export { createAdvisoryLock, type AdvisoryLock } from "./advisory-lock";
export { MIGRATIONS_DIR, migrateDatabase } from "./migrations";
export * as schema from "./schema";
export type { StoredSubmissionResult } from "./schema";
/** Query operators, re-exported so every package builds queries with this package's Drizzle. */
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
