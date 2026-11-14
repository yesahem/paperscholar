import {
  createIngestionSchema,
  ingestionParamsSchema,
  uploadParamsSchema,
  uploadUrlRequestSchema,
} from "@repo/shared";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { validate } from "../../lib/validation";
import type { Ingestions } from "../../services/ingestions";
import type { AppEnv } from "../../types";
import { signedInUserId } from "../signed-in";

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
        new URL(c.req.url).origin,
      );
      return c.json(result, result.created ? 202 : 200);
    })
    .get("/", async (c) => c.json({ ingestions: await ingestions.list() }))
    .get("/:id", validate("param", ingestionParamsSchema), async (c) =>
      c.json(await ingestions.get(c.req.valid("param").id)),
    );
}
