import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { videoObjectKey } from "@repo/content";
import { VIDEO_KEY_MARKER } from "@repo/content/testing";
import {
  courseDetailSchema,
  errorBodySchema,
  courseListSchema,
  courseProgressSchema,
  exerciseResultSchema,
  exerciseSchema,
  instanceConfigSchema,
  itemProgressSchema,
  noteSchema,
  playbackSchema,
} from "@repo/shared";
import { FsStorage } from "@repo/storage";
import { TestBrowser } from "../auth-client";
import { CANARY, syncedContent, type SyncedContent } from "../content-fixture";
import { DATABASE_URL, useTestDatabase } from "../database";
import { createTestApp, testConfig } from "../helpers";

let content: SyncedContent;
beforeAll(async () => {
  content = await syncedContent();
  // One of the two lectures has its video; the other is not uploaded yet.
  await new FsStorage({ root: content.dir }).put(
    videoObjectKey(`attention/${VIDEO_KEY_MARKER}-intro.mp4`),
    new TextEncoder().encode("not really an mp4"),
  );
});
afterAll(async () => {
  await content.cleanup();
});

const BASE = "/api/v1/courses";
const LECTURE = `${BASE}/attention/items/why-attention`;
const EXERCISE = `${BASE}/attention/items/check-1`;

function app(
  overrides: Parameters<typeof testConfig>[0] = {},
  db?: Parameters<typeof createTestApp>[2],
) {
  return createTestApp(
    testConfig({ storage: { driver: "fs", root: content.dir }, ...overrides }),
    content.reader,
    db,
  ).app;
}

describe("the courses feature switch", () => {
  test("is off, and every course endpoint 404, on an instance with no course content", async () => {
    const bare = createTestApp().app;
    const config = instanceConfigSchema.parse(
      await (await bare.request("/api/v1/config")).json(),
    );
    expect(config.features.courses).toBe(false);
    for (const path of [BASE, `${BASE}/attention`, `${LECTURE}/playback`]) {
      expect((await bare.request(path)).status).toBe(404);
    }
  });

  test("is on with course content, and off again with FEATURE_COURSES=false", async () => {
    const on = instanceConfigSchema.parse(
      await (await app().request("/api/v1/config")).json(),
    );
    expect(on.features.courses).toBe(true);
    const disabled = app({ courses: { enabled: false } });
    const off = instanceConfigSchema.parse(
      await (await disabled.request("/api/v1/config")).json(),
    );
    expect(off.features.courses).toBe(false);
    expect((await disabled.request(BASE)).status).toBe(404);
  });
});

describe("the catalogue", () => {
  test("lists courses and syllabi publicly, with no video key or answer", async () => {
    const target = app();
    const list = await target.request(BASE);
    expect(list.headers.get("cache-control")).toContain("public");
    expect(courseListSchema.parse(await list.json()).items).toEqual([
      {
        id: "attention",
        title: "Attention from Scratch",
        summary: "Build attention up from dot products.",
        lectureCount: 2,
        exerciseCount: 1,
        durationSeconds: 1140,
      },
    ]);
    const detail = await target.request(`${BASE}/attention`);
    const text = await detail.text();
    expect(text).not.toContain(VIDEO_KEY_MARKER);
    expect(text).not.toContain(CANARY);
    expect(courseDetailSchema.parse(JSON.parse(text)).items).toEqual([
      {
        id: "why-attention",
        type: "lecture",
        title: "Why attention",
        durationSeconds: 540,
      },
      {
        id: "check-1",
        type: "exercise",
        title: "Check your understanding",
        questionCount: 2,
      },
      { id: "multi-head", type: "lecture", title: "Many heads", durationSeconds: 600 },
    ]);
    expect((await target.request(`${BASE}/no-such-course`)).status).toBe(404);
  });

  test("everything else needs a session", async () => {
    const target = app();
    for (const path of [
      `${LECTURE}/playback`,
      `${EXERCISE}/exercise`,
      `${LECTURE}/notes`,
      `${BASE}/attention/progress`,
    ]) {
      expect({ path, status: (await target.request(path)).status }).toEqual({
        path,
        status: 401,
      });
    }
  });
});

describe.skipIf(!DATABASE_URL)("a signed-in learner", () => {
  const database = useTestDatabase();

  async function learner() {
    const target = app({}, { db: database.db });
    const browser = new TestBrowser(target);
    const username = `crs${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    await browser.signUp({ email: `${username}@example.com`, username });
    return { target, browser, username };
  }

  test("plays any lecture through a short-lived URL that serves the video", async () => {
    const { target, browser } = await learner();
    const response = await browser.request(`${LECTURE}/playback`);
    expect(response.status).toBe(200);
    const playback = playbackSchema.parse(await response.json());
    expect(playback.expiresInSeconds).toBe(300);
    expect(playback.url).not.toContain(VIDEO_KEY_MARKER);
    const video = await target.request(playback.url);
    expect(await video.text()).toBe("not really an mp4");

    const missing = await browser.request(`${BASE}/attention/items/multi-head/playback`);
    expect(missing.status).toBe(404);
    expect(errorBodySchema.parse(await missing.json()).error.message).toBe(
      "This lecture's video is not available yet.",
    );
    expect((await browser.request(`${EXERCISE}/playback`)).status).toBe(404);
  });

  test("an exercise shows no answers until submitted, then grades and completes", async () => {
    const { browser } = await learner();
    const read = await browser.request(`${EXERCISE}/exercise`);
    const text = await read.text();
    expect(text).not.toContain(CANARY);
    expect(text).not.toContain('"answer"');
    expect(exerciseSchema.parse(JSON.parse(text)).questions).toHaveLength(2);
    expect((await browser.request(`${LECTURE}/exercise`)).status).toBe(404);

    const wrongLength = await browser.request(`${EXERCISE}/exercise`, {
      method: "POST",
      body: { answers: [1] },
    });
    expect(wrongLength.status).toBe(400);

    const graded = exerciseResultSchema.parse(
      await (
        await browser.request(`${EXERCISE}/exercise`, {
          method: "POST",
          body: { answers: [1, 0] },
        })
      ).json(),
    );
    expect(graded.score).toBe(1);
    expect(graded.questions.map((question) => question.correct)).toEqual([true, false]);
    expect(graded.questions[1]?.answer).toBe(2);

    await browser.request(`${EXERCISE}/exercise`, {
      method: "POST",
      body: { answers: [0, 0] },
    });
    const progress = courseProgressSchema.parse(
      await (await browser.request(`${BASE}/attention/progress`)).json(),
    );
    // Completed, and the best score is kept.
    expect(progress.items).toEqual([
      expect.objectContaining({ itemId: "check-1", completed: true, score: 1 }),
    ]);
  });

  test("progress and notes follow the account to another device", async () => {
    const { target, browser, username } = await learner();
    const put = await browser.request(`${LECTURE}/progress`, {
      method: "PUT",
      body: { completed: false, lastWatchedSeconds: 125 },
    });
    expect(itemProgressSchema.parse(await put.json())).toMatchObject({
      completed: false,
      lastWatchedSeconds: 125,
    });
    await browser.request(`${LECTURE}/notes`, {
      method: "PUT",
      body: { body: "Q, K and V are projections of the same input." },
    });

    const laptop = new TestBrowser(target);
    await laptop.signIn(`${username}@example.com`);
    const progress = courseProgressSchema.parse(
      await (await laptop.request(`${BASE}/attention/progress`)).json(),
    );
    expect(progress.items).toEqual([
      expect.objectContaining({ itemId: "why-attention", lastWatchedSeconds: 125 }),
    ]);
    const note = noteSchema.parse(
      await (await laptop.request(`${LECTURE}/notes`)).json(),
    );
    expect(note.body).toBe("Q, K and V are projections of the same input.");
    expect(note.updatedAt).not.toBeNull();
  });

  test("a completed lecture stays completed; positions are capped at the lecture's length", async () => {
    const { browser } = await learner();
    const progressOf = async (body: { completed: boolean; lastWatchedSeconds: number }) =>
      itemProgressSchema.parse(
        await (
          await browser.request(`${LECTURE}/progress`, { method: "PUT", body })
        ).json(),
      );
    const done = await progressOf({ completed: true, lastWatchedSeconds: 500 });
    expect(done.completed).toBe(true);
    const rewatched = await progressOf({ completed: false, lastWatchedSeconds: 10 });
    expect(rewatched).toMatchObject({
      completed: true,
      lastWatchedSeconds: 10,
      completedAt: done.completedAt,
    });
    expect(
      (await progressOf({ completed: false, lastWatchedSeconds: 9999 }))
        .lastWatchedSeconds,
    ).toBe(540);
    const exercise = await browser.request(`${EXERCISE}/progress`, {
      method: "PUT",
      body: { completed: true, lastWatchedSeconds: 0 },
    });
    expect(exercise.status).toBe(400);
    const unknown = await browser.request(`${BASE}/attention/items/nope/progress`, {
      method: "PUT",
      body: { completed: true, lastWatchedSeconds: 0 },
    });
    expect(unknown.status).toBe(404);
  });

  test("an empty note clears it; notes are private to their author", async () => {
    const { browser } = await learner();
    await browser.request(`${LECTURE}/notes`, { method: "PUT", body: { body: "mine" } });
    const { browser: other } = await learner();
    expect(
      noteSchema.parse(await (await other.request(`${LECTURE}/notes`)).json()),
    ).toEqual({
      body: "",
      updatedAt: null,
    });
    const cleared = await browser.request(`${LECTURE}/notes`, {
      method: "PUT",
      body: { body: "   " },
    });
    expect(noteSchema.parse(await cleared.json())).toEqual({ body: "", updatedAt: null });
    const tooLong = await browser.request(`${LECTURE}/notes`, {
      method: "PUT",
      body: { body: "x".repeat(10_001) },
    });
    expect(tooLong.status).toBe(400);
  });
});
