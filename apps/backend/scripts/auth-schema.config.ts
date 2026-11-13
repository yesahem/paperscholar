/**
 * Input to Better Auth's schema generator, never loaded by the server:
 *
 *   bun run auth:schema
 *
 * writes packages/db/src/schema/auth.ts from the options that shape the
 * tables. Regenerate after changing src/auth/schema-options.ts, then run
 * `bun run db:generate` for the migration (docs/specs/04-database.md §3).
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { USER_ADDITIONAL_FIELDS, usernamePlugin } from "../src/auth/schema-options";

export const auth = betterAuth({
  database: drizzleAdapter({}, { provider: "pg" }),
  user: { additionalFields: USER_ADDITIONAL_FIELDS },
  plugins: [usernamePlugin()],
});
