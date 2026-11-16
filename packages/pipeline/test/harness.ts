import { CONTENT_INDEX_LOCK, ContentStore } from "@repo/content";
import { closeDb, createAdvisoryLock, createDb, schema, type Database } from "@repo/db";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import {
  defaultLocalPythonPath,
  LocalProvider,
  type SandboxProvider,
} from "@repo/runner";
import { silentLogger } from "@repo/shared/logger";
import { FsStorage } from "@repo/storage";
import { afterAll, beforeAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createScriptedLlm,
  DEFAULT_PIPELINE_SETTINGS,
  demoPaperAnswers,
  PIPELINE_HANDLERS,
  tick,
  type PipelineDeps,
  type PipelineSettings,
  type ScriptedAnswer,
  type ScriptedLlm,
  type TaskHandlers,
  type LlmPurpose,
} from "../src";

/** Postgres for integration tests. CI provides one; locally, docker-compose.dev.yml. */
export const DATABASE_URL = process.env.DATABASE_URL;

export const pythonPath = process.env.RUNNER_PYTHON || defaultLocalPythonPath();
export const hasPython = (() => {
  try {
    return Bun.spawnSync([pythonPath, "-c", "import numpy, pytest"]).exitCode === 0;
  } catch {
    return false;
  }
})();
if (process.env.CI && !hasPython)
  throw new Error(`CI: ${pythonPath} lacks numpy and pytest.`);

export const TEST_SETTINGS: PipelineSettings = {
  ...DEFAULT_PIPELINE_SETTINGS,
  retryBaseMs: 0,
  leaseMs: 60_000,
};

/** A clock tests can move forward, to let leases expire. */
export function testClock() {
  let offsetMs = 0;
  return {
    now: () => new Date(Date.now() + offsetMs),
    advance(ms: number) {
      offsetMs += ms;
    },
  };
}

export interface Harness {
  readonly db: Database;
  readonly storage: FsStorage;
  readonly content: ContentStore;
  readonly sandbox: SandboxProvider;
  deps(options?: {
    llm?: ScriptedLlm;
    answers?: Partial<Record<LlmPurpose, ScriptedAnswer>>;
    settings?: Partial<PipelineSettings>;
    now?: () => Date;
  }): PipelineDeps & { llm: ScriptedLlm };
  /** A user row, as Better Auth would insert it. */
  newUser(): Promise<string>;
}

/** A fresh database and storage folder per test file, with the local Python sandbox. */
export function useHarness(): Harness {
  let database: TestDatabase | null = null;
  let db: Database | null = null;
  let root: string | null = null;
  let storage: FsStorage | null = null;
  let content: ContentStore | null = null;
  const sandbox = new LocalProvider({ pythonPath, nodeEnv: "test" });

  beforeAll(async () => {
    database = await createTestDatabase(DATABASE_URL ?? "");
    db = createDb({ url: database.url, maxConnections: 8 });
    root = await mkdtemp(join(tmpdir(), "pipeline-"));
    storage = new FsStorage({ root });
    content = new ContentStore({
      storage,
      lock: createAdvisoryLock(db, CONTENT_INDEX_LOCK),
      indexTtlMs: 0,
    });
  });

  afterAll(async () => {
    if (db) await closeDb(db);
    await database?.drop();
    if (root) await rm(root, { recursive: true, force: true });
  });

  const ready = <T>(value: T | null): T => {
    if (value === null)
      throw new Error("The harness is not ready; use it inside a test.");
    return value;
  };

  return {
    get db() {
      return ready(db);
    },
    get storage() {
      return ready(storage);
    },
    get content() {
      return ready(content);
    },
    sandbox,
    deps(options = {}) {
      const llm =
        options.llm ?? createScriptedLlm({ answers: demoPaperAnswers(options.answers) });
      return {
        db: ready(db),
        storage: ready(storage),
        content: ready(content),
        llm,
        sandbox,
        logger: silentLogger,
        settings: { ...TEST_SETTINGS, ...options.settings },
        ...(options.now ? { now: options.now } : {}),
      };
    },
    async newUser() {
      const id = Bun.randomUUIDv7();
      const name = `m${id.replaceAll("-", "").slice(-12)}`;
      await ready(db)
        .insert(schema.user)
        .values({
          id,
          name,
          email: `${name}@example.com`,
          username: name,
          role: "maintainer",
        });
      return id;
    },
  };
}

/** Ticks until no task can run; fails the test if that takes too many rounds. */
export async function drain(
  deps: PipelineDeps,
  handlers: TaskHandlers = PIPELINE_HANDLERS,
  rounds = 50,
): Promise<number> {
  let ran = 0;
  for (let round = 0; round < rounds; round += 1) {
    const result = await tick(deps, { handlers, concurrency: 4, budgetMs: 120_000 });
    ran += result.ran;
    if (result.ran === 0) return ran;
  }
  throw new Error(`the pipeline did not settle in ${rounds} rounds`);
}
