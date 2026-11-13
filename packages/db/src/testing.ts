import { sql } from "drizzle-orm";
import { closeDb, createDb } from "./client";
import { migrateDatabase } from "./migrations";

export interface TestDatabase {
  /** Connection URL of the fresh database. */
  url: string;
  /** Drops the database. Close every client using it first. */
  drop(): Promise<void>;
}

/**
 * Creates an empty, fully migrated database next to the one `serverUrl` names,
 * so each test file gets its own (docs/specs/11-security-ops.md §6). The role
 * in `serverUrl` must be allowed to create databases.
 */
export async function createTestDatabase(serverUrl: string): Promise<TestDatabase> {
  const name = `test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = createDb({ url: serverUrl, maxConnections: 1 });
  await admin.execute(sql.raw(`create database "${name}"`));

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const migrator = createDb({ url: url.href, maxConnections: 1, prepare: true });
  try {
    await migrateDatabase(migrator);
  } finally {
    await closeDb(migrator);
  }

  return {
    url: url.href,
    async drop() {
      try {
        await admin.execute(sql.raw(`drop database if exists "${name}" with (force)`));
      } finally {
        await closeDb(admin);
      }
    },
  };
}
