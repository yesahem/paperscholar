import type { FeatureFlags } from "@repo/shared";
import {
  courseItemParamsSchema,
  courseParamsSchema,
  putNoteSchema,
  putProgressSchema,
  submitExerciseSchema,
} from "@repo/shared";
import { Hono } from "hono";
import { validate } from "../lib/validation";
import { requireAuth, requireFeature } from "../middleware/guards";
import { publicCache } from "../middleware/public-cache";
import type { Courses } from "../services/courses";
import type { AppEnv } from "../types";
import { signedInUserId } from "./signed-in";

const ITEM = "/:courseId/items/:itemId";

/**
 * Courses (docs/specs/10-secondary-features.md §5). `404` everywhere while the
 * feature is off. The list and syllabi are public; playing, exercises,
 * progress and notes need a session.
 */
export function coursesRoutes(courses: Courses, features: () => Promise<FeatureFlags>) {
  const catalogue = new Hono<AppEnv>()
    .use(...publicCache())
    .get("/", async (c) => c.json(await courses.list()))
    .get("/:courseId", validate("param", courseParamsSchema), async (c) =>
      c.json(await courses.get(c.req.valid("param").courseId)),
    );

  const learner = new Hono<AppEnv>()
    .use("/:courseId/progress", requireAuth())
    .use("/:courseId/items/*", requireAuth())
    .get("/:courseId/progress", validate("param", courseParamsSchema), async (c) =>
      c.json(
        await courses.progress(signedInUserId(c.var.user), c.req.valid("param").courseId),
      ),
    )
    .get(`${ITEM}/playback`, validate("param", courseItemParamsSchema), async (c) => {
      const { courseId, itemId } = c.req.valid("param");
      return c.json(await courses.playback(courseId, itemId));
    })
    .get(`${ITEM}/exercise`, validate("param", courseItemParamsSchema), async (c) => {
      const { courseId, itemId } = c.req.valid("param");
      return c.json(await courses.exercise(courseId, itemId));
    })
    .post(
      `${ITEM}/exercise`,
      validate("param", courseItemParamsSchema),
      validate("json", submitExerciseSchema),
      async (c) => {
        const { courseId, itemId } = c.req.valid("param");
        return c.json(
          await courses.submitExercise(
            signedInUserId(c.var.user),
            courseId,
            itemId,
            c.req.valid("json").answers,
          ),
        );
      },
    )
    .put(
      `${ITEM}/progress`,
      validate("param", courseItemParamsSchema),
      validate("json", putProgressSchema),
      async (c) => {
        const { courseId, itemId } = c.req.valid("param");
        return c.json(
          await courses.putProgress(
            signedInUserId(c.var.user),
            courseId,
            itemId,
            c.req.valid("json"),
          ),
        );
      },
    )
    .get(`${ITEM}/notes`, validate("param", courseItemParamsSchema), async (c) => {
      const { courseId, itemId } = c.req.valid("param");
      return c.json(await courses.note(signedInUserId(c.var.user), courseId, itemId));
    })
    .put(
      `${ITEM}/notes`,
      validate("param", courseItemParamsSchema),
      validate("json", putNoteSchema),
      async (c) => {
        const { courseId, itemId } = c.req.valid("param");
        return c.json(
          await courses.putNote(
            signedInUserId(c.var.user),
            courseId,
            itemId,
            c.req.valid("json").body,
          ),
        );
      },
    );

  // Learner routes are matched first: their paths are longer than the syllabus's.
  return new Hono<AppEnv>()
    .use(requireFeature(features, "courses"))
    .route("/", learner)
    .route("/", catalogue);
}
