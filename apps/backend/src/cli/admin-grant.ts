/**
 * admin:grant: sets a user's role from the command line
 * (docs/specs/06-auth.md §9). Refuses to demote the last admin.
 *
 *   bun run admin:grant <email> <user|maintainer|admin>
 */
import { roleSchema } from "@repo/shared";
import { parseArgs } from "node:util";
import { z } from "zod";
import { LastAdminError } from "../services/accounts";
import { loadConfigOrExit } from "../load-config";
import { createAccountServices } from "./auth-services";

const { positionals } = parseArgs({ allowPositionals: true, strict: true });
const email = z.email().safeParse(positionals[0]);
const role = roleSchema.safeParse(positionals[1]);
if (positionals.length !== 2 || !email.success || !role.success) {
  console.error("Usage: bun run admin:grant <email> <user|maintainer|admin>");
  process.exit(2);
}

const config = loadConfigOrExit();
const services = createAccountServices(config);
try {
  const userId = await services.accounts.findUserIdByEmail(email.data);
  if (!userId) {
    console.error("admin:grant: no account has that email address.");
    process.exitCode = 1;
  } else {
    const previous = await services.accounts.setRole(userId, role.data);
    console.log(
      previous === role.data
        ? `admin:grant: the account is already ${role.data}.`
        : `admin:grant: ${previous} → ${role.data}. Takes effect on the account's next request.`,
    );
  }
} catch (error) {
  if (error instanceof LastAdminError) {
    console.error(`admin:grant: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await services.close();
}
