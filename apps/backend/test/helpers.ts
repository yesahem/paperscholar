import { ContentStore, createReadOnlyLock } from "@repo/content";
import { FsStorage } from "@repo/storage";
import { createApp } from "../src/create-app";
import type { AppConfig } from "../src/env";
import { createLogger, type LogLevel } from "../src/lib/logger";

export const testConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  env: "test",
  port: 8797,
  webOrigin: "http://localhost:3000",
  logLevel: "debug",
  version: "test-version",
  databaseUrl: null,
  storage: { driver: "fs", root: "/nonexistent-test-storage" },
  limits: { runsPerDay: 100 },
  ...overrides,
});

export interface CapturedLog {
  level: LogLevel;
  entry: Record<string, unknown>;
}

/** A read-only store over `root`; an empty catalogue when nothing was synced there. */
export function readOnlyStore(root = "/nonexistent-test-storage"): ContentStore {
  return new ContentStore({
    storage: new FsStorage({ root }),
    lock: createReadOnlyLock(),
    indexTtlMs: 0,
  });
}

/** An app wired to a logger that records every line for assertions. */
export function createTestApp(
  overrides: Partial<AppConfig> = {},
  content: ContentStore = readOnlyStore(),
) {
  const logs: CapturedLog[] = [];
  const logger = createLogger({
    level: "debug",
    write: (line, level) => logs.push({ level, entry: JSON.parse(line) }),
  });
  const app = createApp({ config: testConfig(overrides), logger, content });
  return { app, logs };
}
