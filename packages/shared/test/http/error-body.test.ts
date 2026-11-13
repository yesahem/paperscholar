import { describe, expect, test } from "bun:test";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_STATUS,
  errorBodySchema,
  type ErrorBody,
} from "../../src";

describe("error contract", () => {
  test("every error code has a status and a message", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  test("a well-formed error body parses", () => {
    const body: ErrorBody = {
      error: { code: "not_found", message: "Not found.", requestId: "req-1" },
    };
    expect(errorBodySchema.parse(body)).toEqual(body);
  });

  test("an unknown error code is rejected", () => {
    const result = errorBodySchema.safeParse({
      error: { code: "teapot", message: "x", requestId: "req-1" },
    });
    expect(result.success).toBe(false);
  });
});
