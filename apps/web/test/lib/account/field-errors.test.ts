import { describe, expect, test } from "bun:test";
import { fieldErrors } from "@/lib/account/field-errors";
import { ApiError } from "@/lib/api/errors";

describe("fieldErrors", () => {
  test("maps validation issues to their fields, first message wins", () => {
    const error = new ApiError("The request is invalid.", 400, "validation_error", {
      details: {
        issues: [
          { path: "bio", message: "must be at most 280 characters" },
          { path: "bio", message: "second" },
          { path: "username", message: "is reserved" },
          { nonsense: true },
        ],
      },
    });
    expect(fieldErrors(error)).toEqual({
      bio: "must be at most 280 characters",
      username: "is reserved",
    });
  });

  test("a username conflict belongs to the username", () => {
    const error = new ApiError("That username is taken.", 409, "conflict");
    expect(fieldErrors(error)).toEqual({ username: "That username is taken." });
  });

  test("anything else has no field", () => {
    expect(fieldErrors(new ApiError("down", 503, "upstream_unavailable"))).toEqual({});
    expect(fieldErrors(new Error("x"))).toEqual({});
  });
});
