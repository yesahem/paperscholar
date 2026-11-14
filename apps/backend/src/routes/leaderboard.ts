import { leaderboardQuerySchema, leaderboardRankQuerySchema } from "@repo/shared";
import { Hono } from "hono";
import { validate } from "../lib/validation";
import { requireAuth } from "../middleware/guards";
import type { Leaderboard } from "../services/leaderboard";
import type { AppEnv } from "../types";
import { signedInUserId } from "./signed-in";

/** Rankings (docs/specs/05-api.md §7). Public, except the caller's own rank. */
export function leaderboardRoutes(leaderboard: Leaderboard) {
  return new Hono<AppEnv>()
    .get("/", validate("query", leaderboardQuerySchema), async (c) =>
      c.json(await leaderboard.page(c.req.valid("query"))),
    )
    .get("/me", requireAuth(), validate("query", leaderboardRankQuerySchema), async (c) =>
      c.json({
        rank: await leaderboard.rank(
          signedInUserId(c.var.user),
          c.req.valid("query").sort,
        ),
      }),
    );
}
