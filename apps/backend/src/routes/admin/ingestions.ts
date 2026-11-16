import {
  addStepRequestBodySchema,
  createIngestionSchema,
  ingestionParamsSchema,
  planSchema,
  regenerateStepRequestSchema,
  stepFilesSchema,
  stepParamsSchema,
  updateDraftSchema,
  uploadParamsSchema,
  uploadUrlRequestSchema,
  verifyStepRequestSchema,
  waiveRequestSchema,
} from "@repo/shared";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { validate } from "../../lib/validation";
import type { Ingestions } from "../../services/ingestions";
import type { AppEnv } from "../../types";
import { signedInUserId } from "../signed-in";

/** This API's origin as the request reached it, for handing work to a new invocation. */
const origin = (url: string) => new URL(url).origin;

/**
 * The paper pipeline's maintainer endpoints (docs/specs/09-paper-pipeline.md
 * §16), under /v1/admin/ingestions. The role guard is applied where /admin is
 * mounted; without a model every endpoint here is not found.
 */
export function adminIngestionRoutes(ingestions: Ingestions | null) {
  const routes = new Hono<AppEnv>();
  if (ingestions === null) {
    return routes.all("*", () => {
      throw new AppError("not_found", {
        message: "The paper pipeline is not enabled here.",
      });
    });
  }
  return routes
    .post("/upload-url", validate("json", uploadUrlRequestSchema), async (c) =>
      c.json(await ingestions.uploadUrl(signedInUserId(c.var.user), c.req.valid("json"))),
    )
    .put("/uploads/:uploadId", validate("param", uploadParamsSchema), async (c) => {
      if (c.req.header("Content-Type") !== "application/pdf") {
        throw new AppError("validation_error", {
          message: "Send the PDF with Content-Type application/pdf.",
        });
      }
      const body = new Uint8Array(await c.req.arrayBuffer());
      await ingestions.receiveUpload(
        signedInUserId(c.var.user),
        c.req.valid("param").uploadId,
        body,
      );
      return c.body(null, 204);
    })
    .post("/", validate("json", createIngestionSchema), async (c) => {
      const result = await ingestions.create(
        signedInUserId(c.var.user),
        c.req.valid("json"),
        origin(c.req.url),
      );
      return c.json(result, result.created ? 202 : 200);
    })
    .get("/", async (c) => c.json({ ingestions: await ingestions.list() }))
    .get("/:id", validate("param", ingestionParamsSchema), async (c) =>
      c.json(await ingestions.get(c.req.valid("param").id)),
    )
    .patch(
      "/:id",
      validate("param", ingestionParamsSchema),
      validate("json", updateDraftSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        await ingestions.updateDraft(id, c.req.valid("json"));
        return c.json(await ingestions.get(id));
      },
    )
    .delete("/:id", validate("param", ingestionParamsSchema), async (c) => {
      await ingestions.discard(c.req.valid("param").id);
      return c.body(null, 204);
    })
    .put(
      "/:id/plan",
      validate("param", ingestionParamsSchema),
      validate("json", planSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        await ingestions.savePlan(id, c.req.valid("json"), origin(c.req.url));
        return c.json(await ingestions.get(id));
      },
    )
    .post(
      "/:id/steps",
      validate("param", ingestionParamsSchema),
      validate("json", addStepRequestBodySchema),
      async (c) => {
        const { id } = c.req.valid("param");
        await ingestions.addStep(
          id,
          c.req.valid("json").description,
          signedInUserId(c.var.user),
          origin(c.req.url),
        );
        return c.json(await ingestions.get(id), 202);
      },
    )
    .get("/:id/steps/:stepId", validate("param", stepParamsSchema), async (c) => {
      const { id, stepId } = c.req.valid("param");
      return c.json(await ingestions.getStep(id, stepId));
    })
    .put(
      "/:id/steps/:stepId",
      validate("param", stepParamsSchema),
      validate("json", stepFilesSchema),
      async (c) => {
        const { id, stepId } = c.req.valid("param");
        return c.json(await ingestions.saveStep(id, stepId, c.req.valid("json")));
      },
    )
    .delete("/:id/steps/:stepId", validate("param", stepParamsSchema), async (c) => {
      const { id, stepId } = c.req.valid("param");
      await ingestions.removeStep(id, stepId);
      return c.body(null, 204);
    })
    .post(
      "/:id/steps/:stepId/verify",
      validate("param", stepParamsSchema),
      validate("json", verifyStepRequestSchema),
      async (c) => {
        const { id, stepId } = c.req.valid("param");
        const result = await ingestions.verifyStep(
          id,
          stepId,
          c.req.valid("json").full,
          origin(c.req.url),
        );
        return c.json(result, result.queued ? 202 : 200);
      },
    )
    .post(
      "/:id/steps/:stepId/regenerate",
      validate("param", stepParamsSchema),
      validate("json", regenerateStepRequestSchema),
      async (c) => {
        const { id, stepId } = c.req.valid("param");
        await ingestions.regenerateStep(
          id,
          stepId,
          c.req.valid("json").note,
          signedInUserId(c.var.user),
          origin(c.req.url),
        );
        return c.json(await ingestions.get(id), 202);
      },
    )
    .post(
      "/:id/steps/:stepId/waive",
      validate("param", stepParamsSchema),
      validate("json", waiveRequestSchema),
      async (c) => {
        const { id, stepId } = c.req.valid("param");
        const { check, reason } = c.req.valid("json");
        await ingestions.waive(id, stepId, check, reason, signedInUserId(c.var.user));
        return c.json(await ingestions.get(id));
      },
    )
    .post("/:id/publish", validate("param", ingestionParamsSchema), async (c) =>
      c.json(
        await ingestions.publish(c.req.valid("param").id, signedInUserId(c.var.user)),
      ),
    )
    .post("/:id/cancel", validate("param", ingestionParamsSchema), async (c) => {
      const { id } = c.req.valid("param");
      await ingestions.cancel(id);
      return c.json(await ingestions.get(id));
    })
    .post("/:id/retry", validate("param", ingestionParamsSchema), async (c) => {
      const { id } = c.req.valid("param");
      await ingestions.retry(id, origin(c.req.url));
      return c.json(await ingestions.get(id), 202);
    });
}
