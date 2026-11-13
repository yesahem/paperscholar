import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { EnvError, httpOriginSchema, parseEnv } from "../src";

const schema = z.object({
  ORIGIN: httpOriginSchema,
  PORT: z.coerce.number().int().default(1234),
});
const options = { app: "demo", exampleFile: "demo/.env.example" };

function problems(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(schema, source, options);
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv", () => {
  test("parses valid input and applies defaults", () => {
    expect(parseEnv(schema, { ORIGIN: "https://example.com/" }, options)).toEqual({
      ORIGIN: "https://example.com",
      PORT: 1234,
    });
  });

  test("names missing and blank variables as required", () => {
    expect(problems({})).toEqual(["ORIGIN is required"]);
    expect(problems({ ORIGIN: "   " })).toEqual(["ORIGIN is required"]);
  });

  test("ignores variables outside the schema", () => {
    expect(
      parseEnv(schema, { ORIGIN: "http://a.test", SECRET: "x" }, options),
    ).not.toHaveProperty("SECRET");
  });

  test("the message names the app and the example file", () => {
    expect(() => parseEnv(schema, {}, options)).toThrow(
      /Invalid demo environment configuration:\n {2}- ORIGIN is required\nSee demo\/\.env\.example\./,
    );
  });
});

describe("httpOriginSchema", () => {
  test("accepts http and https origins", () => {
    expect(httpOriginSchema.parse("http://localhost:3000")).toBe("http://localhost:3000");
    expect(httpOriginSchema.parse("https://example.com/")).toBe("https://example.com");
  });

  test("rejects paths, queries, fragments and other protocols", () => {
    for (const value of [
      "https://example.com/app",
      "https://example.com/?a=1",
      "https://example.com/#x",
      "ftp://example.com",
      "not a url",
    ]) {
      expect(httpOriginSchema.safeParse(value).success).toBe(false);
    }
  });
});
