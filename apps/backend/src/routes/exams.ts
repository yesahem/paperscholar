import {
  createExamAttemptSchema,
  examAttemptParamsSchema,
  listExamAttemptsQuerySchema,
  submitExamAttemptSchema,
} from "@repo/shared";
import { Hono } from "hono";
import { validate } from "../lib/validation";
import { requireAuth } from "../middleware/guards";
import { publicCache } from "../middleware/public-cache";
import type { Exams } from "../services/exams";
import type { AppEnv } from "../types";
import { signedInUserId } from "./signed-in";

/**
 * Quiz mode (docs/specs/10-secondary-features.md §1). Topics are public;
 * attempts need a session. Nothing here returns an answer or an explanation
 * before the attempt is submitted.
 */
export function examsRoutes(exams: Exams) {
  const topics = new Hono<AppEnv>()
    .use(...publicCache())
    .get("/", async (c) => c.json(await exams.listTopics()));

  const attempts = new Hono<AppEnv>()
    .use(requireAuth())
    .post("/", validate("json", createExamAttemptSchema), async (c) =>
      c.json(await exams.start(signedInUserId(c.var.user), c.req.valid("json")), 201),
    )
    .get("/", validate("query", listExamAttemptsQuerySchema), async (c) =>
      c.json(await exams.list(signedInUserId(c.var.user), c.req.valid("query"))),
    )
    .get("/:id", validate("param", examAttemptParamsSchema), async (c) =>
      c.json(await exams.get(signedInUserId(c.var.user), c.req.valid("param").id)),
    )
    .post(
      "/:id/submit",
      validate("param", examAttemptParamsSchema),
      validate("json", submitExamAttemptSchema),
      async (c) =>
        c.json(
          await exams.submit(
            signedInUserId(c.var.user),
            c.req.valid("param").id,
            c.req.valid("json"),
          ),
        ),
    );

  return new Hono<AppEnv>().route("/topics", topics).route("/attempts", attempts);
}
