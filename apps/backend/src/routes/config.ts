import { Hono } from "hono";
import { publicCache } from "../middleware/public-cache";
import type { InstanceFeatures } from "../services/instance-config";
import type { AppEnv } from "../types";

/** GET /v1/config: what this instance offers (docs/specs/05-api.md §8). */
export function configRoutes(features: InstanceFeatures) {
  return new Hono<AppEnv>()
    .use(...publicCache())
    .get("/", async (c) => c.json(await features.config()));
}
