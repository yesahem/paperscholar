import { createApp } from "../src/create-app";
import type { AppConfig } from "../src/env";
import { createLogger, type LogLevel } from "../src/lib/logger";

export const testConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  env: "test",
  port: 8797,
  webOrigin: "http://localhost:3000",
  logLevel: "debug",
  version: "test-version",
  ...overrides,
});

export interface CapturedLog {
  level: LogLevel;
  entry: Record<string, unknown>;
}

/** An app wired to a logger that records every line for assertions. */
export function createTestApp(overrides: Partial<AppConfig> = {}) {
  const logs: CapturedLog[] = [];
  const logger = createLogger({
    level: "debug",
    write: (line, level) => logs.push({ level, entry: JSON.parse(line) }),
  });
  const app = createApp({ config: testConfig(overrides), logger });
  return { app, logs };
}
