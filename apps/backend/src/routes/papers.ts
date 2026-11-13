import { slugSchema, type PaperList } from "@repo/shared";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validation";
import { publicCache } from "../middleware/public-cache";
import type { ContentCatalog } from "../services/content-catalog";
import type { AppEnv } from "../types";

const paperParams = z.object({ paperId: slugSchema });
const problemParams = z.object({ paperId: slugSchema, problemId: slugSchema });

/** GET /v1/papers, /v1/papers/:paperId and its problems (docs/specs/05-api.md §5). */
export function papersRoutes(catalog: ContentCatalog) {
  return new Hono<AppEnv>()
    .use(...publicCache())
    .get("/", async (c) => {
      const body: PaperList = { items: await catalog.listPapers() };
      return c.json(body);
    })
    .get("/:paperId", validate("param", paperParams), async (c) => {
      const { paperId } = c.req.valid("param");
      return c.json(await catalog.getPaper(paperId));
    })
    .get("/:paperId/problems/:problemId", validate("param", problemParams), async (c) => {
      const { paperId, problemId } = c.req.valid("param");
      return c.json(await catalog.getProblem(paperId, problemId));
    });
}
