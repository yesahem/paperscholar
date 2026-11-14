import { ContentStore, createReadOnlyLock } from "@repo/content";
import { createDb, type Database } from "@repo/db";
import type { SandboxProvider } from "@repo/runner";
import { FsStorage } from "@repo/storage";
import type { EmailMessage, EmailSender } from "../src/adapters/email/types";
import { createApp } from "../src/create-app";
import type { AppConfig } from "../src/env";
import { createLogger, type LogLevel } from "@repo/shared/logger";

/** A 32-character secret for tests only. */
export const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret";

/**
 * Lazily connecting client for tests that never reach the database: no
 * connection is opened until a query runs, and none should.
 */
const UNUSED_DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";

export const testConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  env: "test",
  port: 8797,
  webOrigin: "http://localhost:3000",
  logLevel: "debug",
  version: "test-version",
  databaseUrl: UNUSED_DATABASE_URL,
  storage: { driver: "fs", root: "/nonexistent-test-storage" },
  limits: {
    runsPerDay: 100,
    runsPerMinute: 10,
    globalRunsPerDay: 20_000,
    mutationsPerMinute: 60,
  },
  runner: { provider: "local", pythonPath: null },
  internalSecret: null,
  auth: {
    secret: TEST_AUTH_SECRET,
    adminEmails: [],
    signups: true,
    requireEmailVerification: true,
    google: null,
    rateLimit: { max: 10, windowSeconds: 600 },
    clientIpHeader: "x-forwarded-for",
    trustedProxies: [],
  },
  email: { driver: "none" },
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

/** Records every email instead of sending it. */
export function memoryEmailSender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

export interface TestAppOptions {
  content?: ContentStore;
  db?: Database;
  email?: EmailSender | null;
  sandbox?: SandboxProvider;
}

/** A sandbox for tests that must never run code: any run fails the test loudly. */
export const unusedSandbox: SandboxProvider = {
  name: "unused",
  run: async () => {
    throw new Error("This test should not have run code.");
  },
};

/** An app wired to a logger that records every line for assertions. */
export function createTestApp(
  overrides: Partial<AppConfig> = {},
  content: ContentStore = readOnlyStore(),
  { db, email = null, sandbox = unusedSandbox }: Omit<TestAppOptions, "content"> = {},
) {
  const logs: CapturedLog[] = [];
  const logger = createLogger({
    level: "debug",
    write: (line, level) => logs.push({ level, entry: JSON.parse(line) }),
  });
  const background: Promise<unknown>[] = [];
  const config = testConfig(overrides);
  const app = createApp({
    config,
    logger,
    content,
    db: db ?? createDb({ url: config.databaseUrl, maxConnections: 1 }),
    email,
    sandbox,
    runInBackground: (task) => {
      background.push(task);
    },
  });
  /** Waits for work started after responses, such as emails and runs. */
  const settle = async () => {
    while (background.length > 0) await Promise.all(background.splice(0));
  };
  return { app, logs, settle };
}
