import { startEvalSchema } from "@repo/shared";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { validate } from "../../lib/validation";
import { requireRole } from "../../middleware/guards";
import type { Accounts } from "../../services/accounts";
import type { AdminEvals } from "../../services/evals";
import type { AppEnv } from "../../types";
import { signedInUserId } from "../signed-in";

/** This API's origin as the request reached it, for handing work to a new invocation. */
const origin = (url: string) => new URL(url).origin;

/**
 * `/v1/admin/evals` (docs/specs/14-cms.md §8.3). Admins only; without a model
 * every endpoint is not found, like the rest of the pipeline.
 */
export function adminEvalRoutes(evals: AdminEvals | null, accounts: Accounts) {
  const routes = new Hono<AppEnv>().use(requireRole("admin", accounts.currentRole));
  if (evals === null) {
    return routes.all("*", () => {
      throw new AppError("not_found", {
        message: "The paper pipeline is not enabled here.",
      });
    });
  }
  return routes
    .get("/latest", async (c) => c.json(await evals.latest()))
    .post("/", validate("json", startEvalSchema), async (c) =>
      c.json(
        await evals.start(
          signedInUserId(c.var.user),
          { fresh: c.req.valid("json").fresh },
          origin(c.req.url),
        ),
        202,
      ),
    );
}
