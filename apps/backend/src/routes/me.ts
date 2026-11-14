import { deleteMeSchema, updateMeSchema, type AvatarUploaded } from "@repo/shared";
import { Hono } from "hono";
import type { Auth } from "../auth/auth";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validation";
import { requireAuth } from "../middleware/guards";
import type { Accounts } from "../services/accounts";
import type { Avatars } from "../services/avatars";
import type { AppEnv } from "../types";
import { signedInUserId } from "./signed-in";

/** Where `POST /v1/me/avatar` is mounted; its body limit is raised for the file. */
export const AVATAR_UPLOAD_PATH = "/api/v1/me/avatar";

/** The one file of a `multipart/form-data` body, in the field `avatar`. */
async function avatarFile(request: Request): Promise<File> {
  const invalid = (message: string, cause?: unknown) =>
    new AppError("validation_error", {
      message: "Send one image in the form field “avatar”.",
      details: { issues: [{ path: "avatar", message }] },
      cause,
    });
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data")) {
    throw invalid("must be sent as multipart/form-data");
  }
  const form = await request.formData().catch((error: unknown) => {
    throw invalid("could not be read", error);
  });
  const fields = [...form.keys()];
  const values = form.getAll("avatar");
  const file = values[0];
  if (fields.some((field) => field !== "avatar") || values.length !== 1) {
    throw invalid("must be the only field, sent once");
  }
  if (!(file instanceof File)) throw invalid("must be a file");
  return file;
}

/** The signed-in user's own account (docs/specs/05-api.md §7). */
export function meRoutes(accounts: Accounts, avatars: Avatars, auth: Auth) {
  return new Hono<AppEnv>()
    .use(requireAuth())
    .get("/", async (c) => {
      const me = await accounts.getMe(signedInUserId(c.var.user));
      if (!me) throw new AppError("unauthenticated");
      return c.json(me);
    })
    .patch("/", validate("json", updateMeSchema), async (c) => {
      const me = await accounts.updateMe(signedInUserId(c.var.user), c.req.valid("json"));
      return c.json(me);
    })
    .delete("/", validate("json", deleteMeSchema), async (c) => {
      const userId = signedInUserId(c.var.user);
      await accounts.confirmDeletion(userId, c.req.valid("json").confirm);
      // Signing out yields the headers that clear the session cookies.
      const { headers } = await auth.api.signOut({
        headers: c.req.raw.headers,
        returnHeaders: true,
      });
      await accounts.deleteAccount(userId);
      c.var.logger.info("account deleted", { userId });
      const response = c.body(null, 204);
      for (const cookie of headers.getSetCookie()) {
        response.headers.append("Set-Cookie", cookie);
      }
      return response;
    })
    .post("/avatar", async (c) => {
      const userId = signedInUserId(c.var.user);
      const avatarUrl = await avatars.upload(userId, await avatarFile(c.req.raw));
      c.var.logger.info("avatar changed", { userId });
      const body: AvatarUploaded = { avatarUrl };
      return c.json(body);
    })
    .delete("/avatar", async (c) => {
      await avatars.remove(signedInUserId(c.var.user));
      return c.body(null, 204);
    });
}
