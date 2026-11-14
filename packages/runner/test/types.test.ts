import { describe, expect, test } from "bun:test";
import { buildRunRequest, runRequestSchema } from "../src";
import { reluProblem, reluSolution } from "./fixtures";

const request = buildRunRequest(reluProblem, {
  runId: "sub-3",
  code: reluSolution,
  mode: "submit",
});

describe("runRequestSchema", () => {
  test("accepts what buildRunRequest produces", () => {
    expect(runRequestSchema.parse(request)).toEqual(request);
  });

  test("refuses paths outside the working directory or over the harness", () => {
    for (const path of [
      "../solution.py",
      "/etc/passwd.py",
      "harness.py",
      "conftest.py",
      "tests/../x.py",
      "notes.txt",
    ]) {
      const files = [...request.files, { path, content: "" }];
      expect(runRequestSchema.safeParse({ ...request, files }).success).toBe(false);
    }
  });

  test("refuses repeated paths, unsafe run ids and unknown fields", () => {
    const files = [...request.files, { path: "solution.py", content: "" }];
    expect(runRequestSchema.safeParse({ ...request, files }).success).toBe(false);
    expect(runRequestSchema.safeParse({ ...request, runId: "a b" }).success).toBe(false);
    expect(runRequestSchema.safeParse({ ...request, runId: "--rm" }).success).toBe(false);
    expect(runRequestSchema.safeParse({ ...request, extra: true }).success).toBe(false);
  });
});
