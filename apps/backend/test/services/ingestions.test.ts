import { describe, expect, test } from "bun:test";
import { schema } from "@repo/db";
import { demoPdf, PipelineError } from "@repo/pipeline";
import { silentLogger } from "@repo/shared/logger";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPipelineDeps } from "../../src/adapters/pipeline";
import { AppError } from "../../src/lib/errors";
import { createIngestions, toAppError } from "../../src/services/ingestions";
import { DATABASE_URL, useTestDatabase } from "../database";
import { TEST_PIPELINE_LIMITS, testConfig, unusedSandbox } from "../helpers";

describe("toAppError", () => {
  test("maps pipeline errors to API errors, keeping the message", () => {
    const cases = [
      ["invalid_pdf", "validation_error"],
      ["too_large", "payload_too_large"],
      ["limit_reached", "quota_exceeded"],
      ["conflict", "conflict"],
      ["not_found", "not_found"],
    ] as const;
    for (const [code, expected] of cases) {
      const mapped = toAppError(new PipelineError(code, `because ${code}`));
      expect(mapped).toBeInstanceOf(AppError);
      expect(mapped).toMatchObject({ code: expected, message: `because ${code}` });
    }
    const other = new Error("x");
    expect(toAppError(other)).toBe(other);
  });
});

describe.skipIf(!DATABASE_URL)("createIngestions with arXiv", () => {
  const database = useTestDatabase();

  async function service() {
    const root = await mkdtemp(join(tmpdir(), "ingest-service-"));
    const config = testConfig({
      storage: { driver: "fs", root },
      pipeline: {
        llm: { driver: "fake", model: "fake-demo" },
        enabled: true,
        limits: TEST_PIPELINE_LIMITS,
      },
    });
    const deps = createPipelineDeps(config, {
      db: database.db,
      sandbox: unusedSandbox,
      logger: silentLogger,
    });
    if (!deps) throw new Error("the fake model should enable the pipeline");
    const fetched: string[] = [];
    const fakeFetch = (async (input: string | URL | Request) => {
      fetched.push(String(input instanceof Request ? input.url : input));
      return new Response(demoPdf("arxiv-service"), {
        headers: { "content-type": "application/pdf" },
      });
    }) as typeof fetch;
    const kicks: string[] = [];
    const ingestions = createIngestions({
      deps,
      kick: (origin) => kicks.push(origin),
      fetch: fakeFetch,
    });
    const userId = Bun.randomUUIDv7();
    await database.db.insert(schema.user).values({
      id: userId,
      name: "m",
      email: `${userId}@example.com`,
      username: `m${userId.replaceAll("-", "").slice(-12)}`,
      role: "maintainer",
    });
    return { ingestions, fetched, kicks, userId };
  }

  const body = (arxivId: string) => ({
    arxivId,
    rightsConfirmed: true as const,
    force: false,
    options: { targetSteps: null, environment: null, focus: null, pauseAfterPlan: false },
  });

  test("downloads from arxiv.org once; asking again returns the ingestion without downloading", async () => {
    const { ingestions, fetched, kicks, userId } = await service();
    const first = await ingestions.create(
      userId,
      body("arxiv:1706.03762"),
      "https://api.example.org",
    );
    expect(first).toMatchObject({ created: true, status: "queued" });
    expect(fetched).toEqual(["https://arxiv.org/pdf/1706.03762"]);
    expect(kicks).toEqual(["https://api.example.org"]);

    const again = await ingestions.create(
      userId,
      body("https://arxiv.org/abs/1706.03762"),
      "https://api.example.org",
    );
    expect(again).toEqual({ ...first, created: false });
    expect(fetched).toHaveLength(1);
    expect((await ingestions.get(first.id)).sourceRef).toBe("1706.03762");
  });

  test("refuses something that is not an arXiv id, without fetching", async () => {
    const { ingestions, fetched, userId } = await service();
    await expect(
      ingestions.create(
        userId,
        body("https://evil.example/paper.pdf"),
        "https://api.example.org",
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(fetched).toEqual([]);
  });
});
