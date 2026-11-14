import type { Database } from "@repo/db";
import { Hono } from "hono";
import { requireAuth } from "../middleware/guards";
import { listSolves } from "../services/progress";
import type { AppEnv } from "../types";
import { signedInUserId } from "./signed-in";

/** `GET /v1/progress`: every problem the caller has solved (docs/specs/05-api.md §7). */
export function progressRoutes(db: Database) {
  return new Hono<AppEnv>()
    .use(requireAuth())
    .get("/", async (c) => c.json(await listSolves(db, signedInUserId(c.var.user))));
}
