import {
  createSubmissionSchema,
  listSubmissionsQuerySchema,
  submissionParamsSchema,
  type SubmissionCreated,
} from "@repo/shared";
import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validation";
import { requireVerified } from "../middleware/guards";
import type { Submissions } from "../services/submissions";
import type { AppEnv } from "../types";

/**
 * Running and submitting code (docs/specs/05-api.md §6). Every route needs a
 * session, and a verified email on instances that verify addresses.
 */
export function submissionsRoutes(
  submissions: Submissions,
  instanceVerifiesEmail: boolean,
) {
  return new Hono<AppEnv>()
    .use(requireVerified(instanceVerifiesEmail))
    .post("/", validate("json", createSubmissionSchema), async (c) => {
      const { id } = await submissions.create(signedIn(c.var.user), c.req.valid("json"));
      const body: SubmissionCreated = { id, status: "queued" };
      return c.json(body, 202);
    })
    .get("/", validate("query", listSubmissionsQuerySchema), async (c) =>
      c.json(await submissions.list(signedIn(c.var.user), c.req.valid("query"))),
    )
    .get("/:id", validate("param", submissionParamsSchema), async (c) =>
      c.json(await submissions.get(signedIn(c.var.user), c.req.valid("param").id)),
    );
}

function signedIn(user: { id: string } | null): string {
  if (!user) throw new AppError("unauthenticated");
  return user.id;
}
