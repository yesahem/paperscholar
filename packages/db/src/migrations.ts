import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import type { Database } from "./client";

/** Directory holding the generated SQL migrations. */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * Applies every pending migration. Safe to run repeatedly; applied migrations
 * are recorded and skipped. Use a direct connection, not a pooler.
 */
export async function migrateDatabase(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
