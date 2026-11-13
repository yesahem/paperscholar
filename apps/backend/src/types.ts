import type { RequestIdVariables } from "hono/request-id";
import type { AuthSession, AuthUser } from "./auth/auth";
import type { Logger } from "./lib/logger";

/** Hono environment shared by every route and middleware. */
export interface AppEnv {
  Variables: RequestIdVariables & {
    /** Logger carrying this request's id. */
    logger: Logger;
    /** The signed-in user, or null. Set by `session()` on every /v1 route. */
    user: AuthUser | null;
    /** The current session, or null. Set by `session()` on every /v1 route. */
    session: AuthSession["session"] | null;
  };
}
