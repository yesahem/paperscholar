import { paperListSchema, paperDetailSchema } from "@repo/shared";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CANARY, syncedContent, type SyncedContent } from "./content-fixture";
import { createTestApp } from "./helpers";

/**
 * docs/specs/03-content.md §9: every private part of the fixture carries a
 * canary string, and no learner-facing endpoint may ever return it. New
 * public endpoints are added to `fixedPaths`; paper and problem paths are
 * discovered from the catalogue so new content is covered automatically.
 */
const fixedPaths = ["/api/health", "/api/v1/config", "/api/v1/papers", "/api/v1/tracks"];

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
