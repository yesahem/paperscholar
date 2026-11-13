export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** A logger that adds `fields` to every line it writes. */
  child(fields: LogFields): Logger;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogWriter = (line: string, level: LogLevel) => void;

const writeToConsole: LogWriter = (line, level) => {
  if (LEVEL_RANK[level] >= LEVEL_RANK.warn) console.error(line);
  else console.log(line);
};

/** Error objects do not serialise to JSON; turn them into plain fields. */
function serialise(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause !== undefined ? { cause: serialise(value.cause) } : {}),
    };
  }
  return value;
}

export interface CreateLoggerOptions {
  level: LogLevel;
  /** Where lines go. Defaults to stdout, or stderr for warn and error. */
  write?: LogWriter;
  /** Fields added to every line. */
  base?: LogFields;
}

/**
 * Structured logger writing one JSON object per line. Request bodies, code,
 * cookies, tokens and email addresses must never be passed in `fields`
 * (docs/specs/11-security-ops.md §5).
 */
export function createLogger({
  level,
  write = writeToConsole,
  base = {},
}: CreateLoggerOptions): Logger {
  const threshold = LEVEL_RANK[level];

  const log = (lineLevel: LogLevel, message: string, fields: LogFields = {}) => {
    if (LEVEL_RANK[lineLevel] < threshold) return;
    const entry: LogFields = {
      time: new Date().toISOString(),
      level: lineLevel,
      msg: message,
    };
    for (const [key, value] of Object.entries({ ...base, ...fields })) {
      entry[key] = serialise(value);
    }
    write(JSON.stringify(entry), lineLevel);
  };

  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
    child: (fields) => createLogger({ level, write, base: { ...base, ...fields } }),
  };
}

/** Discards everything. For tests that do not inspect logs. */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};
