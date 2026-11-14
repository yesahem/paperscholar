import { describe, expect, test } from "bun:test";
import {
  AuthRequestError,
  changePassword,
  googleSignInUrl,
  hasSession,
  signInWithEmail,
  signUpWithEmail,
  type FetchLike,
} from "@/lib/auth/auth-api";

function recording(response: Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  return { calls, fetchImpl };
}

describe("auth API calls", () => {
  test("sign-up posts JSON to Better Auth with the username as the name", async () => {
    const { calls, fetchImpl } = recording(Response.json({ token: "t" }));
    await signUpWithEmail(
      { email: "ada@example.com", password: "correct horse", username: "ada" },
      fetchImpl,
    );
    expect(calls[0]?.url).toBe("/api/auth/sign-up/email");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      email: "ada@example.com",
      password: "correct horse",
      username: "ada",
      name: "ada",
      callbackURL: "/verify-email",
    });
  });

  test("changing the password signs out every other session", async () => {
    const { calls, fetchImpl } = recording(Response.json({ token: null }));
    await changePassword(
      { currentPassword: "old one", newPassword: "new one!" },
      fetchImpl,
    );
    expect(calls[0]?.url).toBe("/api/auth/change-password");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      currentPassword: "old one",
      newPassword: "new one!",
      revokeOtherSessions: true,
    });
  });

  test("a wrong current password reads as such", async () => {
    const { fetchImpl } = recording(
      Response.json({ code: "INVALID_PASSWORD" }, { status: 400 }),
    );
    const error = await changePassword(
      { currentPassword: "x", newPassword: "yyyyyyyy" },
      fetchImpl,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthRequestError);
    expect(error instanceof AuthRequestError && error.problem.message).toBe(
      "Your current password is not right.",
    );
  });

  test("a refusal becomes an AuthRequestError with a readable problem", async () => {
    const { fetchImpl } = recording(
      Response.json({ code: "USERNAME_IS_ALREADY_TAKEN" }, { status: 400 }),
    );
    const error = await signUpWithEmail(
      { email: "a@example.com", password: "x".repeat(8), username: "ada" },
      fetchImpl,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthRequestError);
    expect(error instanceof AuthRequestError && error.problem.field).toBe("username");
  });

  test("a 429 reads Retry-After", async () => {
    const { fetchImpl } = recording(
      new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
    );
    const error = await signInWithEmail(
      { email: "a@example.com", password: "x" },
      fetchImpl,
    ).catch((caught: unknown) => caught);
    expect(error instanceof AuthRequestError && error.problem.message).toBe(
      "Too many attempts. Try again in 2 minutes.",
    );
  });

  test("Google returns the provider URL to navigate to", async () => {
    const { calls, fetchImpl } = recording(
      Response.json({
        url: "https://accounts.google.com/o/oauth2/auth?x=1",
        redirect: true,
      }),
    );
    expect(await googleSignInUrl("/papers", fetchImpl)).toBe(
      "https://accounts.google.com/o/oauth2/auth?x=1",
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      provider: "google",
      callbackURL: "/papers",
    });
  });

  test("hasSession reads Better Auth's session check", async () => {
    expect(await hasSession(undefined, recording(Response.json(null)).fetchImpl)).toBe(
      false,
    );
    const signedIn = Response.json({ session: { id: "s1" }, user: { id: "u1" } });
    expect(await hasSession(undefined, recording(signedIn).fetchImpl)).toBe(true);
  });
});
