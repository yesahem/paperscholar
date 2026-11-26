import type { FeatureFlags } from "@repo/shared";
import {
  coldMailParamsSchema,
  createColdMailSchema,
  cvParamsSchema,
  listColdMailsQuerySchema,
  type ColdMailCreated,
} from "@repo/shared";
import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validation";
import { requireFeature, requireVerified } from "../middleware/guards";
import type { ColdMailService } from "../services/cold-mail";
import type { AppEnv } from "../types";
import { signedInUserId } from "./signed-in";

/** Where `POST /v1/cv` is mounted; its body limit is raised for the file. */
export const CV_UPLOAD_PATH = "/api/v1/cv";

/** The one file of a `multipart/form-data` body, in the field `cv`. */
async function cvFile(request: Request): Promise<File> {
  const invalid = (message: string, cause?: unknown) =>
    new AppError("validation_error", {
      message: "Upload your CV as one PDF file in the form field “cv”.",
      details: { issues: [{ path: "cv", message }] },
      cause,
    });
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data")) {
    throw invalid("must be sent as multipart/form-data");
  }
  const form = await request.formData().catch((error: unknown) => {
    throw invalid("could not be read", error);
  });
  const values = form.getAll("cv");
  const file = values[0];
  if ([...form.keys()].some((field) => field !== "cv") || values.length !== 1) {
    throw invalid("must be the only field, sent once");
  }
  if (!(file instanceof File)) throw invalid("must be a file");
  return file;
}

/**
 * CVs and cold mails (docs/specs/10-secondary-features.md §6). `404` while
 * the feature is off; every route needs a session, and a verified email on
 * instances that verify addresses, because each draft costs model tokens.
 */
export function coldMailRoutes(
  service: ColdMailService,
  features: () => Promise<FeatureFlags>,
  instanceVerifiesEmail: boolean,
) {
  const cv = new Hono<AppEnv>()
    .post("/", async (c) => {
      const file = await cvFile(c.req.raw);
      const uploaded = await service.uploadCv(signedInUserId(c.var.user), {
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
      });
      return c.json(uploaded, 201);
    })
    .get("/", async (c) =>
      c.json({ items: await service.listCvs(signedInUserId(c.var.user)) }),
    )
    .delete("/:id", validate("param", cvParamsSchema), async (c) => {
      await service.deleteCv(signedInUserId(c.var.user), c.req.valid("param").id);
      return c.body(null, 204);
    });

  const mails = new Hono<AppEnv>()
    .post("/", validate("json", createColdMailSchema), async (c) => {
      const { id } = await service.create(
        signedInUserId(c.var.user),
        c.req.valid("json"),
      );
      const body: ColdMailCreated = { id };
      return c.json(body, 202);
    })
    .get("/", validate("query", listColdMailsQuerySchema), async (c) =>
      c.json(await service.list(signedInUserId(c.var.user), c.req.valid("query"))),
    )
    .get("/:id", validate("param", coldMailParamsSchema), async (c) =>
      c.json(await service.get(signedInUserId(c.var.user), c.req.valid("param").id)),
    );

  const guards = [
    requireFeature(features, "coldMail"),
    requireVerified(instanceVerifiesEmail),
  ];
  return {
    cv: new Hono<AppEnv>().use(...guards).route("/", cv),
    coldMails: new Hono<AppEnv>().use(...guards).route("/", mails),
  };
}
