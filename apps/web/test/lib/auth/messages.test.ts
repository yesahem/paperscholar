import { describe, expect, test } from "bun:test";
import { authProblem } from "@/lib/auth/messages";

describe("authProblem", () => {
  test("points field problems at their field", () => {
    expect(authProblem(400, "USERNAME_IS_ALREADY_TAKEN", null)).toEqual({
      message: "That username is taken.",
      field: "username",
    });
    expect(authProblem(422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", null).field).toBe(
      "email",
    );
    expect(authProblem(400, "PASSWORD_TOO_SHORT", null).field).toBe("password");
  });

  test("a failed sign-in does not say which half was wrong", () => {
    expect(authProblem(401, "INVALID_EMAIL_OR_PASSWORD", null).message).toBe(
      "That email and password do not match an account.",
    );
    expect(authProblem(401, null, null).field).toBeNull();
  });

  test("rate limits say when to try again", () => {
    expect(authProblem(429, null, 540).message).toBe(
      "Too many attempts. Try again in 9 minutes.",
    );
    expect(authProblem(429, null, 20).message).toBe(
      "Too many attempts. Try again in a minute.",
    );
    expect(authProblem(429, null, null).message).toBe(
      "Too many attempts. Try again later.",
    );
  });

  test("network failures and unknown errors get a generic sentence", () => {
    expect(authProblem(null, null, null).message).toContain("Could not reach the server");
    expect(authProblem(500, "SOMETHING", null).message).toContain("on our side");
  });
});
