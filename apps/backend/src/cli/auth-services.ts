import { closeDb, createDb } from "@repo/db";
import { createAuth } from "../auth/auth";
import type { AppConfig } from "../env";
import { createLogger } from "@repo/shared/logger";
import { createAccounts, type Accounts } from "../services/accounts";
import { createRateLimiter } from "../services/rate-limiter";

export interface AccountServices {
  accounts: Accounts;
  /** Releases database connections. Call before the command exits. */
  close(): Promise<void>;
}

/** Accounts for a command-line tool: same rules as the server, no email. */
export function createAccountServices(config: AppConfig): AccountServices {
  const db = createDb({ url: config.databaseUrl, maxConnections: 2 });
  const logger = createLogger({ level: "warn" });
  const auth = createAuth({
    config,
    db,
    email: null,
    limiter: createRateLimiter(db),
    logger,
    runInBackground: (task) => {
      task.catch((error: unknown) => logger.error("background task failed", { error }));
    },
  });
  return { accounts: createAccounts({ db, auth }), close: () => closeDb(db) };
}
