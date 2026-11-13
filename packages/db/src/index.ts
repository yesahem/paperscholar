export { closeDb, createDb, type Database, type DatabaseOptions } from "./client";
export { createAdvisoryLock, type AdvisoryLock } from "./advisory-lock";
export { MIGRATIONS_DIR, migrateDatabase } from "./migrations";
export * as schema from "./schema";
/** Query operators, re-exported so every package builds queries with this package's Drizzle. */
export { and, count, eq, ne, sql } from "drizzle-orm";
