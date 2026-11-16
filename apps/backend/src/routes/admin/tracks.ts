import { putTracksSchema } from "@repo/shared";
import { Hono } from "hono";
import { validate } from "../../lib/validation";
import type { AdminTracksService } from "../../services/admin-tracks";
import type { AppEnv } from "../../types";

/** `/v1/admin/tracks` (docs/specs/14-cms.md §7). The role guard is applied where /admin is mounted. */
export function adminTrackRoutes(tracks: AdminTracksService) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json(await tracks.get()))
    .put("/", validate("json", putTracksSchema), async (c) =>
      c.json(await tracks.put(c.req.valid("json"))),
    );
}
