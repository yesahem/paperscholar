import type { Role } from "@repo/shared";
import {
  createFeedbackSchema,
  feedbackParamsSchema,
  listFeedbackQuerySchema,
  updateFeedbackSchema,
} from "@repo/shared";
import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validation";
import { requireAuth } from "../middleware/guards";
import type { Actor, Feedback } from "../services/feedback";
import type { AppEnv } from "../types";
import { signedInUserId } from "./signed-in";

/** The signed-in user with their current role. */
export async function actorOf(
  user: { id: string } | null,
  currentRole: (userId: string) => Promise<Role | null>,
): Promise<Actor> {
  const id = signedInUserId(user);
  const role = await currentRole(id);
  if (!role) throw new AppError("unauthenticated");
  return { id, role };
}

/**
 * Reviews and bug reports (docs/specs/10-secondary-features.md §4). Approved
 * reviews are public; everything else needs a session.
 */
export function feedbackRoutes(
  feedback: Feedback,
  currentRole: (userId: string) => Promise<Role | null>,
) {
  return new Hono<AppEnv>()
    .get("/", validate("query", listFeedbackQuerySchema), async (c) => {
      const query = c.req.valid("query");
      if (query.mine === undefined) return c.json(await feedback.listReviews(query));
      return c.json(await feedback.listMine(signedInUserId(c.var.user), query));
    })
    .post("/", requireAuth(), validate("json", createFeedbackSchema), async (c) =>
      c.json(await feedback.create(signedInUserId(c.var.user), c.req.valid("json")), 201),
    )
    .patch(
      "/:id",
      requireAuth(),
      validate("param", feedbackParamsSchema),
      validate("json", updateFeedbackSchema),
      async (c) =>
        c.json(
          await feedback.update(
            await actorOf(c.var.user, currentRole),
            c.req.valid("param").id,
            c.req.valid("json"),
          ),
        ),
    )
    .delete("/:id", requireAuth(), validate("param", feedbackParamsSchema), async (c) => {
      await feedback.remove(
        await actorOf(c.var.user, currentRole),
        c.req.valid("param").id,
      );
      return c.body(null, 204);
    });
}
