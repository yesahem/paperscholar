import { Hono } from "hono";
import { z } from "zod";
import type { AvatarStore } from "../adapters/avatar-store";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validation";
import type { AppEnv } from "../types";

const paramsSchema = z.strictObject({
  userId: z.uuid(),
  file: z.string().regex(/^[0-9a-f-]{36}\.webp$/),
});

/**
 * `GET /api/avatars/:userId/:file`: avatars kept by the `fs` driver. Each key
 * is written once, so the file may be cached for good. With `r2` the public
 * bucket serves them and this route answers 404.
 */
export function avatarRoutes(store: AvatarStore) {
  return new Hono<AppEnv>().get(
    "/:userId/:file",
    validate("param", paramsSchema),
    async (c) => {
      const read = store.read;
      if (read === null) throw new AppError("not_found");
      const { userId, file } = c.req.valid("param");
      const object = await read(`avatars/${userId}/${file}`);
      if (!object) throw new AppError("not_found");
      return c.body(new Uint8Array(object.body), 200, {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'",
      });
    },
  );
}
