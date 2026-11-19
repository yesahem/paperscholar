import type { Role } from "@repo/shared";
import {
  adminFeedbackQuerySchema,
  feedbackParamsSchema,
  setFeedbackStatusSchema,
} from "@repo/shared";
import { Hono } from "hono";
import { validate } from "../../lib/validation";
import type { Feedback } from "../../services/feedback";
import type { AppEnv } from "../../types";
import { actorOf } from "../feedback";

/**
 * `/v1/admin/feedback`: the maintainers' inbox in the CMS (docs/specs/14-cms.md
 * §6). Maintainers see everything and resolve bug reports; approving or
 * rejecting a review needs an admin.
 */
export function adminFeedbackRoutes(
  feedback: Feedback,
  currentRole: (userId: string) => Promise<Role | null>,
) {
  return new Hono<AppEnv>()
    .get("/", validate("query", adminFeedbackQuerySchema), async (c) =>
      c.json(await feedback.listForMaintainers(c.req.valid("query"))),
    )
    .patch(
      "/:id",
      validate("param", feedbackParamsSchema),
      validate("json", setFeedbackStatusSchema),
      async (c) =>
        c.json(
          await feedback.setStatus(
            await actorOf(c.var.user, currentRole),
            c.req.valid("param").id,
            c.req.valid("json").status,
          ),
        ),
    );
}
