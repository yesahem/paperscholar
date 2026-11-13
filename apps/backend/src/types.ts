import type { RequestIdVariables } from "hono/request-id";
import type { Logger } from "./lib/logger";

/** Hono environment shared by every route and middleware. */
export interface AppEnv {
  Variables: RequestIdVariables & {
    /** Logger carrying this request's id. */
    logger: Logger;
  };
}
