import { adminUserParamsSchema, adminUserQuerySchema, setRoleSchema } from "@repo/shared";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { validate } from "../../lib/validation";
import { requireRole } from "../../middleware/guards";
import { LastAdminError, type Accounts } from "../../services/accounts";
import type { AppEnv } from "../../types";

/** `/v1/admin/users`: roles (docs/specs/05-api.md §8). Admins only; maintainers see 404. */
export function adminUserRoutes(accounts: Accounts) {
  return new Hono<AppEnv>()
    .use(requireRole("admin", accounts.currentRole))
    .get("/", validate("query", adminUserQuerySchema), async (c) =>
      c.json({ users: await accounts.listUsers(c.req.valid("query").q) }),
    )
    .patch(
      "/:id",
      validate("param", adminUserParamsSchema),
      validate("json", setRoleSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const { role } = c.req.valid("json");
        try {
          await accounts.setRole(id, role);
        } catch (error) {
          if (error instanceof LastAdminError) {
            throw new AppError("conflict", { message: error.message, cause: error });
          }
          throw error;
        }
        const [user] = (await accounts.listUsers("", 1_000)).filter(
          (candidate) => candidate.id === id,
        );
        if (!user) throw new AppError("not_found");
        return c.json(user);
      },
    );
}
