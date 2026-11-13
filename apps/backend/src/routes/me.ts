import { deleteMeSchema, updateMeSchema } from "@repo/shared";
import { Hono } from "hono";
import type { Auth } from "../auth/auth";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validation";
import { requireAuth } from "../middleware/guards";
import type { Accounts } from "../services/accounts";
import type { AppEnv } from "../types";

/** The signed-in user's own account (docs/specs/05-api.md §7). */
export function meRoutes(accounts: Accounts, auth: Auth) {
  return new Hono<AppEnv>()
    .use(requireAuth())
    .get("/", async (c) => {
      const me = await accounts.getMe(signedIn(c.var.user));
      if (!me) throw new AppError("unauthenticated");
      return c.json(me);
    })
    .patch("/", validate("json", updateMeSchema), async (c) => {
      const me = await accounts.updateMe(signedIn(c.var.user), c.req.valid("json"));
      return c.json(me);
    })
    .delete("/", validate("json", deleteMeSchema), async (c) => {
      const userId = signedIn(c.var.user);
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
    });
}

/** The id of the user `requireAuth()` has already established. */
function signedIn(user: { id: string } | null): string {
  if (!user) throw new AppError("unauthenticated");
  return user.id;
}
