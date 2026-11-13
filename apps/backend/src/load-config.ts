import { EnvError } from "@repo/shared";
import { loadConfig, type AppConfig } from "./env";

/**
 * For long-running entry points and commands: validates the environment and,
 * when it is invalid, prints every problem and exits instead of throwing.
 */
export function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
