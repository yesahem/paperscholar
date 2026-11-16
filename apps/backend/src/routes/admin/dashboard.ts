import { dashboardQuerySchema } from "@repo/shared";
import { Hono } from "hono";
import { validate } from "../../lib/validation";
import type { AdminDashboard } from "../../services/dashboard";
import type { AppEnv } from "../../types";
import { signedInUserId } from "../signed-in";

/** `GET /v1/admin/dashboard` (docs/specs/14-cms.md §8.1). The role guard is applied where /admin is mounted. */
export function adminDashboardRoutes(dashboard: AdminDashboard) {
  return new Hono<AppEnv>().get("/", validate("query", dashboardQuerySchema), async (c) =>
    c.json(await dashboard.read(c.req.valid("query").days, signedInUserId(c.var.user))),
  );
}
