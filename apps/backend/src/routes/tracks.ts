import type { TrackList } from "@repo/shared";
import { Hono } from "hono";
import { publicCache } from "../middleware/public-cache";
import type { ContentCatalog } from "../services/content-catalog";
import type { AppEnv } from "../types";

/** GET /v1/tracks: learning tracks over published papers (docs/specs/05-api.md §5). */
export function tracksRoutes(catalog: ContentCatalog) {
  return new Hono<AppEnv>().use(...publicCache()).get("/", async (c) => {
    const body: TrackList = { items: await catalog.listTracks() };
    return c.json(body);
  });
}
