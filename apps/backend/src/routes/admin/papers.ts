import { paperIdParamsSchema } from "@repo/shared";
import { Hono } from "hono";
import { validate } from "../../lib/validation";
import type { AdminPapers } from "../../services/admin-papers";
import type { AppEnv } from "../../types";
import { signedInUserId } from "../signed-in";

/** `/v1/admin/papers` (docs/specs/05-api.md §8). The role guard is applied where /admin is mounted. */
export function adminPaperRoutes(papers: AdminPapers) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json({ papers: await papers.list() }))
    .post("/:paperId/archive", validate("param", paperIdParamsSchema), async (c) =>
      c.json(
        await papers.setStatus(
          c.req.valid("param").paperId,
          "archived",
          signedInUserId(c.var.user),
        ),
      ),
    )
    .post("/:paperId/publish", validate("param", paperIdParamsSchema), async (c) =>
      c.json(
        await papers.setStatus(
          c.req.valid("param").paperId,
          "published",
          signedInUserId(c.var.user),
        ),
      ),
    );
}
