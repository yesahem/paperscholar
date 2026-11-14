import { describe, expect, test } from "bun:test";
import { createLogger, type LogLevel } from "../src/logger";

function capture(level: LogLevel) {
  const lines: { level: LogLevel; entry: Record<string, unknown> }[] = [];
  const logger = createLogger({
    level,
    write: (line, lineLevel) => lines.push({ level: lineLevel, entry: JSON.parse(line) }),
  });
  return { logger, lines };
}

describe("createLogger", () => {
  test("writes one JSON object per line with time, level and message", () => {
    const { logger, lines } = capture("debug");
    logger.info("hello", { answer: 42 });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.entry).toMatchObject({ level: "info", msg: "hello", answer: 42 });
    expect(typeof lines[0]?.entry.time).toBe("string");
  });

  test("drops lines below the configured level", () => {
    const { logger, lines } = capture("warn");
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(lines.map((line) => line.entry.msg)).toEqual(["c", "d"]);
  });

  test("serialises errors, including their cause", () => {
    const { logger, lines } = capture("debug");
    logger.error("failed", { error: new Error("outer", { cause: new Error("inner") }) });

    const error = lines[0]?.entry.error as Record<string, unknown>;
    expect(error.message).toBe("outer");
    expect((error.cause as Record<string, unknown>).message).toBe("inner");
    expect(typeof error.stack).toBe("string");
  });

  test("child loggers add their fields to every line", () => {
    const { logger, lines } = capture("debug");
    logger.child({ requestId: "r1" }).info("inside");
    expect(lines[0]?.entry.requestId).toBe("r1");
  });
});
