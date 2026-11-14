import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

export interface DatabaseOptions {
  /** Postgres connection string. */
  url: string;
  /**
   * Connections per process. Serverless instances keep this small because
   * many run at once (docs/specs/04-database.md §1).
   * @default 3
   */
  maxConnections?: number;
  /**
   * Prepared statements. Transaction-mode poolers do not support them, so they
   * are off unless a caller knows it holds a direct connection.
   * @default false
   */
  prepare?: boolean;
}

/**
 * Creates the Drizzle client. Connections open lazily on the first query, so
 * creating it at module scope costs nothing until it is used.
 */
export function createDb({ url, maxConnections = 3, prepare = false }: DatabaseOptions) {
  const client = new SQL({
    url,
    max: maxConnections,
    prepare,
    idleTimeout: 20,
  });
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDb>;

/** The client inside `db.transaction(async (tx) => …)`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Closes every pooled connection. Call before a short-lived process exits. */
export async function closeDb(db: Database): Promise<void> {
  await db.$client.close();
}
