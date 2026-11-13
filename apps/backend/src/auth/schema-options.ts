import {
  normaliseUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  usernameProblem,
} from "@repo/shared";
import type { BetterAuthOptions } from "better-auth";
import { username } from "better-auth/plugins/username";

/**
 * The parts of the Better Auth configuration that shape its tables. Shared by
 * the running server (auth.ts) and the schema generator (auth-schema.config.ts),
 * so the generated Drizzle schema always matches what the server expects.
 */

/** Extra columns on Better Auth's `user` table (docs/specs/04-database.md §3). */
export const USER_ADDITIONAL_FIELDS = {
  role: {
    type: ["user", "maintainer", "admin"],
    required: false,
    defaultValue: "user",
    /** Never accepted from a client; changed only by admin:grant and admins. */
    input: false,
  },
} as const satisfies NonNullable<
  NonNullable<BetterAuthOptions["user"]>["additionalFields"]
>;

/** The username plugin, configured with the rules of docs/specs/06-auth.md §3. */
export function usernamePlugin() {
  return username({
    minUsernameLength: USERNAME_MIN_LENGTH,
    maxUsernameLength: USERNAME_MAX_LENGTH,
    usernameNormalization: normaliseUsername,
    validationOrder: { username: "post-normalization" },
    usernameValidator: (value) => usernameProblem(value) === null,
    // The handle is the only name shown; a second display form adds nothing.
    displayUsername: false,
  });
}
