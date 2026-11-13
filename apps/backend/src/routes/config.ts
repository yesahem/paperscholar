import type { InstanceConfig } from "@repo/shared";
import { Hono } from "hono";
import { publicCache } from "../middleware/public-cache";
import type { AppEnv } from "../types";

/** GET /v1/config: what this instance offers (docs/specs/05-api.md §8). */
export function configRoutes(config: InstanceConfig) {
  return new Hono<AppEnv>().use(...publicCache()).get("/", (c) => c.json(config));
}
