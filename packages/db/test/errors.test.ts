import { describe, expect, test } from "bun:test";
import { isUniqueViolation } from "../src";

describe("isUniqueViolation", () => {
  test("finds SQLSTATE 23505 anywhere in the cause chain", () => {
    const pg = Object.assign(new Error("duplicate key"), { errno: "23505" });
    expect(isUniqueViolation(new Error("query failed", { cause: pg }))).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("x"), { code: "23505" }))).toBe(
      true,
    );
    expect(isUniqueViolation(new Error("other"))).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
