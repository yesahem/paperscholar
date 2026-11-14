import { describe, expect, test } from "bun:test";
import {
  createSubmissionSchema,
  listSubmissionsQuerySchema,
  MAX_CODE_BYTES,
  submissionParamsSchema,
} from "../../src";

const valid = {
  paperId: "adam",
  problemId: "01-moment-estimates",
  code: "def f():\n    return 1\n",
  mode: "run" as const,
};

describe("createSubmissionSchema", () => {
  test("accepts a run and a submit", () => {
    expect(createSubmissionSchema.parse(valid)).toEqual(valid);
    expect(createSubmissionSchema.parse({ ...valid, mode: "submit" }).mode).toBe(
      "submit",
    );
  });

  test("rejects empty or whitespace-only code", () => {
    expect(createSubmissionSchema.safeParse({ ...valid, code: "" }).success).toBe(false);
    expect(createSubmissionSchema.safeParse({ ...valid, code: " \n\t" }).success).toBe(
      false,
    );
  });

  test("measures the limit in UTF-8 bytes, not characters", () => {
    const atLimit = "a".repeat(MAX_CODE_BYTES);
    expect(createSubmissionSchema.safeParse({ ...valid, code: atLimit }).success).toBe(
      true,
    );
    // 2 bytes each: under the limit in characters, over it in bytes.
    const accented = "é".repeat(MAX_CODE_BYTES / 2 + 1);
    const result = createSubmissionSchema.safeParse({ ...valid, code: accented });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `must be at most ${MAX_CODE_BYTES} bytes`,
    );
  });

  test("rejects unknown fields, unknown modes and malformed ids", () => {
    expect(createSubmissionSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(createSubmissionSchema.safeParse({ ...valid, mode: "debug" }).success).toBe(
      false,
    );
    expect(createSubmissionSchema.safeParse({ ...valid, paperId: "../x" }).success).toBe(
      false,
    );
  });
});

describe("listSubmissionsQuerySchema", () => {
  test("defaults the page size and coerces it from the query string", () => {
    expect(listSubmissionsQuerySchema.parse({}).limit).toBe(20);
    expect(listSubmissionsQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(listSubmissionsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(listSubmissionsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  test("a problem needs its paper", () => {
    expect(listSubmissionsQuerySchema.safeParse({ problemId: "x" }).success).toBe(false);
    expect(
      listSubmissionsQuerySchema.safeParse({ paperId: "adam", problemId: "x" }).success,
    ).toBe(true);
  });
});

describe("submissionParamsSchema", () => {
  test("ids are UUIDs", () => {
    expect(submissionParamsSchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(
      submissionParamsSchema.safeParse({ id: "01890a5d-ac96-774b-bcce-b302099a8057" })
        .success,
    ).toBe(true);
  });
});
