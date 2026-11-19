import { defaultLocalPythonPath, LocalProvider } from "@repo/runner";
import {
  examAttemptSchema,
  paperListSchema,
  paperDetailSchema,
  submissionCreatedSchema,
} from "@repo/shared";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestBrowser } from "./auth-client";
import { CANARY, syncedContent, type SyncedContent } from "./content-fixture";
import { DATABASE_URL, useTestDatabase } from "./database";
import { createTestApp } from "./helpers";

/**
 * docs/specs/03-content.md §9: every private part of the fixture carries a
 * canary string, and no learner-facing endpoint may ever return it. New
 * public endpoints are added to `fixedPaths`; paper and problem paths are
 * discovered from the catalogue so new content is covered automatically.
 */
const fixedPaths = [
  "/api/health",
  "/api/v1/config",
  "/api/v1/papers",
  "/api/v1/tracks",
  "/api/v1/exams/topics",
];

let content: SyncedContent;
beforeAll(async () => {
  content = await syncedContent();
});
afterAll(async () => {
  await content.cleanup();
});

async function learnerPaths(app: ReturnType<typeof createTestApp>["app"]) {
  const paths = [...fixedPaths];
  const list = paperListSchema.parse(await (await app.request("/api/v1/papers")).json());
  for (const { id } of list.items) {
    paths.push(`/api/v1/papers/${id}`);
    const paper = paperDetailSchema.parse(
      await (await app.request(`/api/v1/papers/${id}`)).json(),
    );
    for (const problem of paper.problems) {
      paths.push(`/api/v1/papers/${id}/problems/${problem.id}`);
    }
  }
  return paths;
}

describe("private-content canary", () => {
  test("appears in no learner-facing response", async () => {
    const { app } = createTestApp({}, content.reader);
    const paths = await learnerPaths(app);
    expect(paths.length).toBeGreaterThan(fixedPaths.length + 2);

    for (const path of paths) {
      const res = await app.request(path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
      expect({ path, leaked: (await res.text()).includes(CANARY) }).toEqual({
        path,
        leaked: false,
      });
    }
  });
});

describe.skipIf(!DATABASE_URL)("private-content canary in quiz attempts", () => {
  const database = useTestDatabase();

  test("answers and explanations appear in no response before an attempt is graded", async () => {
    const { app } = createTestApp({}, content.reader, { db: database.db });
    const browser = new TestBrowser(app);
    const username = `quizcanary${Date.now().toString(36)}`;
    await browser.signUp({ email: `${username}@example.com`, username });

    const started = await browser.request("/api/v1/exams/attempts", {
      method: "POST",
      body: { topics: ["nlp", "vision"], count: 30 },
    });
    expect(started.status).toBe(201);
    const text = await started.text();
    expect(text.includes(CANARY)).toBe(false);
    const attempt = examAttemptSchema.parse(JSON.parse(text));
    expect(text).not.toContain('"answer"');
    expect(text).not.toContain('"explanation"');

    for (const path of [
      `/api/v1/exams/attempts/${attempt.id}`,
      "/api/v1/exams/attempts",
    ]) {
      const body = await (await browser.request(path)).text();
      expect({ path, leaked: body.includes(CANARY) }).toEqual({ path, leaked: false });
      expect({ path, answers: body.includes('"answer"') }).toEqual({
        path,
        answers: false,
      });
    }
  });
});

const python = process.env.RUNNER_PYTHON || defaultLocalPythonPath();
const hasPython = Bun.spawnSync([python, "-c", "import numpy, pytest"]).exitCode === 0;

describe.skipIf(!DATABASE_URL || !hasPython)(
  "private-content canary in submissions",
  () => {
    const database = useTestDatabase();

    test("a real run of every problem returns none of the private parts", async () => {
      const { app, settle } = createTestApp({}, content.reader, {
        db: database.db,
        sandbox: new LocalProvider({ pythonPath: python, nodeEnv: "test" }),
      });
      const browser = new TestBrowser(app);
      const username = `canary${Date.now().toString(36)}`;
      await browser.signUp({ email: `${username}@example.com`, username });

      const list = paperListSchema.parse(
        await (await app.request("/api/v1/papers")).json(),
      );
      for (const { id: paperId } of list.items) {
        const paper = paperDetailSchema.parse(
          await (await app.request(`/api/v1/papers/${paperId}`)).json(),
        );
        for (const problem of paper.problems) {
          const created = await browser.request("/api/v1/submissions", {
            method: "POST",
            body: {
              paperId,
              problemId: problem.id,
              code: "def relu(x):\n    return x\n",
              mode: "submit",
            },
          });
          expect(created.status).toBe(202);
          const { id } = submissionCreatedSchema.parse(await created.json());
          await settle();
          for (const path of [
            `/api/v1/submissions/${id}`,
            "/api/v1/submissions",
            "/api/v1/progress",
            "/api/v1/leaderboard",
            "/api/v1/leaderboard/me",
            `/api/v1/users/${username}`,
            `/api/v1/users/${username}/following`,
          ]) {
            const body = await (await browser.request(path)).text();
            expect({ path, leaked: body.includes(CANARY) }).toEqual({
              path,
              leaked: false,
            });
          }
        }
      }
    });
  },
);
