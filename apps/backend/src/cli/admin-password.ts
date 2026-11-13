/**
 * admin:password: sets a user's password from the command line, for
 * instances that cannot send reset emails (docs/specs/06-auth.md §1). The new
 * password is read from standard input, never from arguments, so it stays
 * out of shell history. Signs the user out everywhere.
 *
 *   bun run admin:password <email>
 */
import { parseArgs } from "node:util";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { loadConfigOrExit } from "../load-config";
import { createAccountServices } from "./auth-services";

const { positionals } = parseArgs({ allowPositionals: true, strict: true });
const email = z.email().safeParse(positionals[0]);
if (positionals.length !== 1 || !email.success) {
  console.error(
    "Usage: bun run admin:password <email>   (the password is read from stdin)",
  );
  process.exit(2);
}

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) process.stdout.write("New password: ");
  for await (const line of console) return line;
  return "";
}

const config = loadConfigOrExit();
const services = createAccountServices(config);
try {
  const userId = await services.accounts.findUserIdByEmail(email.data);
  if (!userId) {
    console.error("admin:password: no account has that email address.");
    process.exitCode = 1;
  } else {
    await services.accounts.setPassword(userId, await readPassword());
    console.log("admin:password: password set; the account was signed out everywhere.");
  }
} catch (error) {
  if (error instanceof AppError) {
    console.error(`admin:password: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await services.close();
}
