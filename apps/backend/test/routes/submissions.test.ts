import { and, eq, schema } from "@repo/db";
import type { RunRequest, RunResult, SandboxProvider } from "@repo/runner";
import {
  errorBodySchema,
  MAX_CODE_BYTES,
  submissionCreatedSchema,
  submissionListSchema,
  submissionSchema,
} from "@repo/shared";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AppConfig } from "../../src/env";
import { TestBrowser } from "../auth-client";
import { syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, memoryEmailSender, testConfig } from "../helpers";

const PAPER = "rectifier-networks";
const PROBLEM = "relu";
const CODE = "import numpy as np\n\n\ndef relu(x):\n    return np.maximum(x, 0)\n";

function testResult(
  name: string,
  group: "public" | "hidden",
  status: "passed" | "failed" = "passed",
): RunResult["tests"][number] {
  return {
    name,
    group,
    status,
    durationMs: 2,
    message: status === "failed" ? "values should be clipped" : null,
    traceback: status === "failed" ? "solution.py, line 4, in relu" : null,
    stdout: "printed",
    timedOut: false,
  };
}

const PASSED: RunResult = {
  outcome: "completed",
  tests: [
    testResult("test_public_one", "public"),
    testResult("test_hidden_one", "hidden"),
  ],
  violations: [],
  errorOutput: null,
  durationMs: 120,
};

/** A sandbox whose answer each test chooses, recording every request. */
function scriptedSandbox() {
  const requests: RunRequest[] = [];
  let answer: (request: RunRequest) => Promise<RunResult> = async () => PASSED;
  const provider: SandboxProvider = {
    name: "scripted",
    run: async (request) => {
      requests.push(request);
      return answer(request);
    },
  };
  return {
    provider,
    requests,
    respond(next: (request: RunRequest) => Promise<RunResult>) {
      answer = next;
    },
  };
}

let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
};

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

describe("/api/v1/submissions without a session", () => {
  test("answers 401 before looking at the body", async () => {
    const { app } = createTestApp();
    const response = await app.request("/api/v1/submissions", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("unauthenticated");
  });
});

describe.skipIf(!DATABASE_URL)("/api/v1/submissions", () => {
  const database = useTestDatabase();
  let content: SyncedContent;
  const sandbox = scriptedSandbox();

  beforeAll(async () => {
    content = await syncedContent();
  });
  afterAll(async () => {
    await content.cleanup();
  });

  async function signedIn(overrides: Partial<AppConfig> = {}) {
    const { app, settle, logs } = createTestApp(overrides, content.reader, {
      db: database.db,
      sandbox: sandbox.provider,
    });
    const browser = new TestBrowser(app);
    const username = unique("sub_");
    await browser.signUp({ email: `${username}@example.com`, username });
    return { app, browser, settle, logs };
  }

  const submit = (
    browser: TestBrowser,
    body: Record<string, unknown> = {},
  ): Promise<Response> =>
    browser.request("/api/v1/submissions", {
      method: "POST",
      body: { paperId: PAPER, problemId: PROBLEM, code: CODE, mode: "run", ...body },
    });

  async function created(response: Response): Promise<string> {
    expect(response.status).toBe(202);
    return submissionCreatedSchema.parse(await response.json()).id;
  }

  async function read(browser: TestBrowser, id: string) {
    const response = await browser.request(`/api/v1/submissions/${id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    return submissionSchema.parse(await response.json());
  }

  test("a run is accepted, queued, executed in the background and graded", async () => {
    sandbox.respond(async () => PASSED);
    const { browser, settle, logs } = await signedIn();
    const id = await created(await submit(browser));
    await settle();

    const submission = await read(browser, id);
    expect(submission).toMatchObject({
      id,
      paperId: PAPER,
      problemId: PROBLEM,
      mode: "run",
      status: "completed",
      verdict: "passed",
      testsPassed: 2,
      testsTotal: 2,
      durationMs: 120,
      code: CODE,
    });
    expect(submission.finishedAt).not.toBeNull();
    // Nothing logged carries the submitted code.
    expect(JSON.stringify(logs)).not.toContain("np.maximum");
    expect(logs.some((log) => log.entry.msg === "submission finished")).toBe(true);
  });

  test("run sends only public tests; submit adds hidden ones; the solution is never sent", async () => {
    sandbox.respond(async () => PASSED);
    const { browser, settle } = await signedIn();
    sandbox.requests.length = 0;
    await created(await submit(browser, { mode: "run" }));
    await settle();
    await created(await submit(browser, { mode: "submit" }));
    await settle();
    const [run, full] = sandbox.requests;
    expect(run?.files.map((file) => file.path)).toEqual([
      "solution.py",
      "tests/test_public.py",
    ]);
    expect(full?.files.map((file) => file.path)).toEqual([
      "solution.py",
      "tests/test_public.py",
      "tests/test_hidden.py",
    ]);
    expect(full?.files.find((file) => file.path === "solution.py")?.content).toBe(CODE);
    expect(full?.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("hidden tests reveal only their name and message, whatever the sandbox sent", async () => {
    sandbox.respond(async () => ({
      ...PASSED,
      tests: [
        testResult("test_public_one", "public", "failed"),
        testResult("test_hidden_one", "hidden", "failed"),
      ],
    }));
    const { browser, settle } = await signedIn();
    const id = await created(await submit(browser, { mode: "submit" }));
    await settle();
    const submission = await read(browser, id);
    expect(submission.verdict).toBe("failed");
    const [publicTest, hiddenTest] = submission.tests ?? [];
    expect(publicTest).toMatchObject({
      traceback: "solution.py, line 4, in relu",
      stdout: "printed",
    });
    expect(hiddenTest).toMatchObject({
      message: "values should be clipped",
      traceback: null,
      stdout: null,
    });
  });

  test("while running, the result fields are null", async () => {
    let finish: () => void = () => {};
    sandbox.respond(() => new Promise((resolve) => (finish = () => resolve(PASSED))));
    const { browser, settle } = await signedIn();
    const id = await created(await submit(browser));
    await Bun.sleep(20);
    const running = await read(browser, id);
    expect(running).toMatchObject({
      status: "running",
      verdict: null,
      tests: null,
      testsPassed: null,
      finishedAt: null,
    });
    finish();
    await settle();
    expect((await read(browser, id)).status).toBe("completed");
  });

  test("two simultaneous submissions: one 202 and one 409 naming the first", async () => {
    let finish: () => void = () => {};
    sandbox.respond(() => new Promise((resolve) => (finish = () => resolve(PASSED))));
    const { browser, settle } = await signedIn();
    const [first, second] = await Promise.all([submit(browser), submit(browser)]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([202, 409]);
    const accepted = first.status === 202 ? first : second;
    const refused = first.status === 202 ? second : first;
    const { id } = submissionCreatedSchema.parse(await accepted.json());
    const error = await errorOf(refused);
    expect(error.code).toBe("submission_in_progress");
    expect(error.details).toEqual({ submissionId: id });
    finish();
    await settle();
    // Once it finishes, the next one is accepted.
    sandbox.respond(async () => PASSED);
    await created(await submit(browser));
    await settle();
  });

  test("a sandbox failure is our error, not the learner's", async () => {
    sandbox.respond(async () => {
      throw new Error("sandbox unreachable");
    });
    const { browser, settle, logs } = await signedIn();
    const id = await created(await submit(browser));
    await settle();
    expect(await read(browser, id)).toMatchObject({
      status: "error",
      verdict: "internal_error",
    });
    expect(
      logs.some((log) => log.level === "error" && log.entry.submissionId === id),
    ).toBe(true);

    sandbox.respond(async () => ({ ...PASSED, outcome: "harness_error", tests: [] }));
    const second = await created(await submit(browser));
    await settle();
    expect(await read(browser, second)).toMatchObject({
      status: "error",
      verdict: "internal_error",
    });
  });

  test("a run lost mid-flight is reaped after two minutes, and the user can submit again", async () => {
    sandbox.respond(async () => PASSED);
    const { browser, settle } = await signedIn();
    const id = await created(await submit(browser));
    await settle();
    // Simulate a worker that died: the row stays running, three minutes old.
    await database.db
      .update(schema.submissions)
      .set({
        status: "running",
        verdict: null,
        createdAt: new Date(Date.now() - 180_000),
      })
      .where(eq(schema.submissions.id, id));
    expect(await read(browser, id)).toMatchObject({
      status: "error",
      verdict: "internal_error",
    });

    await database.db
      .update(schema.submissions)
      .set({ status: "queued", verdict: null, createdAt: new Date(Date.now() - 180_000) })
      .where(eq(schema.submissions.id, id));
    await created(await submit(browser));
    await settle();
  });

  test("unknown or unpublished problems are 404", async () => {
    const { browser } = await signedIn();
    expect((await submit(browser, { problemId: "99-missing" })).status).toBe(404);
    expect((await submit(browser, { paperId: "no-such-paper" })).status).toBe(404);
  });

  test("empty, oversized or malformed bodies are validation errors", async () => {
    const { browser } = await signedIn();
    for (const body of [
      { code: "   " },
      { code: "x".repeat(MAX_CODE_BYTES + 1) },
      { mode: "debug" },
      { extra: true },
    ]) {
      const response = await submit(browser, body);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("validation_error");
    }
  });

  test("another user's submission is 404, and so is a malformed id", async () => {
    sandbox.respond(async () => PASSED);
    const owner = await signedIn();
    const id = await created(await submit(owner.browser));
    await owner.settle();
    const stranger = await signedIn();
    expect((await stranger.browser.request(`/api/v1/submissions/${id}`)).status).toBe(
      404,
    );
    expect(
      (await stranger.browser.request("/api/v1/submissions/not-a-uuid")).status,
    ).toBe(400);
  });

  test("more than RUNS_PER_MINUTE attempts in a minute are 429 with Retry-After", async () => {
    sandbox.respond(async () => PASSED);
    const limits = { ...testConfig().limits, runsPerMinute: 2 };
    const { browser, settle } = await signedIn({ limits });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await created(await submit(browser));
      await settle();
    }
    const refused = await submit(browser);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    const error = await errorOf(refused);
    expect(error.code).toBe("rate_limited");
    expect(error.details).toMatchObject({ retryAfterSeconds: expect.any(Number) });
  });

  test("the daily limit refuses with when it resets; our own failures do not count", async () => {
    const limits = { ...testConfig().limits, runsPerDay: 2 };
    const { browser, settle } = await signedIn({ limits });
    sandbox.respond(async () => {
      throw new Error("down");
    });
    await created(await submit(browser));
    await settle();
    sandbox.respond(async () => PASSED);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await created(await submit(browser));
      await settle();
    }
    const refused = await submit(browser);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).not.toBeNull();
    const error = await errorOf(refused);
    expect(error.code).toBe("quota_exceeded");
    const resetsAt = new Date((error.details as { resetsAt: string }).resetsAt);
    expect(resetsAt.getUTCHours()).toBe(0);
    expect(resetsAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("past the global daily ceiling, 503, and the refused run is neither stored nor counted", async () => {
    sandbox.respond(async () => PASSED);
    const limits = { ...testConfig().limits, globalRunsPerDay: 1 };
    const { browser, settle } = await signedIn({ limits });
    const today = new Date(new Date().toISOString().slice(0, 10));
    const key = "submissions:global";
    const counters = schema.rateLimitCounters;
    const [before] = await database.db
      .select({ count: counters.count })
      .from(counters)
      .where(and(eq(counters.key, key), eq(counters.windowStart, today)));
    const response = await submit(browser);
    if ((before?.count ?? 0) === 0) {
      // First run today in this database: the one allowed run.
      await created(response);
      await settle();
      const refused = await submit(browser);
      expect(refused.status).toBe(503);
    } else {
      expect(response.status).toBe(503);
    }
    const [after] = await database.db
      .select({ count: counters.count })
      .from(counters)
      .where(and(eq(counters.key, key), eq(counters.windowStart, today)));
    expect(after?.count).toBe(Math.max(before?.count ?? 0, 1));
  });

  test("history: newest first, filtered, paged with an opaque cursor, without code", async () => {
    sandbox.respond(async () => PASSED);
    const { browser, settle } = await signedIn();
    const submitAndSettle = async (mode: "run" | "submit") => {
      const id = await created(await submit(browser, { mode }));
      await settle();
      return id;
    };
    const oldest = await submitAndSettle("run");
    const middle = await submitAndSettle("submit");
    const newest = await submitAndSettle("run");
    const first = await browser.request(
      `/api/v1/submissions?paperId=${PAPER}&problemId=${PROBLEM}&limit=2`,
    );
    const page = submissionListSchema.parse(await first.json());
    expect(page.items.map((item) => item.id)).toEqual([newest, middle]);
    expect(page.nextCursor).not.toBeNull();
    expect(JSON.stringify(page)).not.toContain("np.maximum");

    const second = submissionListSchema.parse(
      await (
        await browser.request(
          `/api/v1/submissions?paperId=${PAPER}&problemId=${PROBLEM}&limit=2&cursor=${page.nextCursor}`,
        )
      ).json(),
    );
    expect(second.items.map((item) => item.id)).toEqual([oldest]);
    expect(second.nextCursor).toBeNull();

    const submits = submissionListSchema.parse(
      await (await browser.request("/api/v1/submissions?mode=submit")).json(),
    );
    expect(submits.items.map((item) => item.id)).toEqual([middle]);

    expect((await browser.request("/api/v1/submissions?cursor=garbage")).status).toBe(
      400,
    );
    expect(
      (await browser.request(`/api/v1/submissions?problemId=${PROBLEM}`)).status,
    ).toBe(400);
  });

  test("another user's history is not visible", async () => {
    sandbox.respond(async () => PASSED);
    const owner = await signedIn();
    await created(await submit(owner.browser));
    await owner.settle();
    const stranger = await signedIn();
    const list = submissionListSchema.parse(
      await (await stranger.browser.request("/api/v1/submissions")).json(),
    );
    expect(list.items).toEqual([]);
  });

  test("an instance that verifies email refuses unverified users with 403", async () => {
    const { app } = createTestApp({ email: { driver: "log" } }, content.reader, {
      db: database.db,
      email: memoryEmailSender(),
      sandbox: sandbox.provider,
    });
    const browser = new TestBrowser(app);
    const username = unique("unver_");
    expect(
      (await browser.signUp({ email: `${username}@example.com`, username })).status,
    ).toBe(200);
    const response = await submit(browser);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("email_not_verified");
  });
});
