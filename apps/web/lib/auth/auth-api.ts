// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import type { FetchLike } from "@/lib/api/client";
import { retryAfterSeconds } from "@/lib/api/errors";
import { authProblem, type AuthProblem } from "./messages";

/**
 * Calls to Better Auth's routes under /api/auth (docs/specs/06-auth.md §8),
 * through the same-origin proxy. Thin and validated, instead of Better Auth's
 * client library, to keep the page bundle small.
 */

/** An auth request failed; `problem` is safe to show. */
export class AuthRequestError extends Error {
  constructor(readonly problem: AuthProblem) {
    super(problem.message);
    this.name = "AuthRequestError";
  }
}

const errorSchema = z.object({ code: z.optional(z.string()) });
const redirectSchema = z.object({ url: z.string() });

export type { FetchLike };

async function post(
  path: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/auth${path}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError(authProblem(null, null, null));
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(json);
    throw new AuthRequestError(
      authProblem(
        response.status,
        parsed.success ? (parsed.data.code ?? null) : null,
        retryAfterSeconds(response),
      ),
    );
  }
  return json;
}

const sessionSchema = z.nullable(z.object({ session: z.object({ id: z.string() }) }));

/**
 * Whether the browser holds a live session. Better Auth answers 200 with
 * `null` when it does not, so a visitor's page shows no failed request.
 */
export async function hasSession(
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetchImpl("/api/auth/get-session", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch {
    throw new AuthRequestError(authProblem(null, null, null));
  }
  if (!response.ok) {
    throw new AuthRequestError(
      authProblem(response.status, null, retryAfterSeconds(response)),
    );
  }
  const parsed = sessionSchema.safeParse(await response.json().catch(() => null));
  return parsed.success && parsed.data !== null;
}

/** Where a verification link lands (app/(auth)/verify-email). */
export const VERIFY_EMAIL_PATH = "/verify-email";
/** Where a password-reset link lands (app/(auth)/reset-password). */
export const RESET_PASSWORD_PATH = "/reset-password";

export async function signUpWithEmail(
  input: { email: string; password: string; username: string },
  fetchImpl?: FetchLike,
): Promise<void> {
  await post(
    "/sign-up/email",
    { ...input, name: input.username, callbackURL: VERIFY_EMAIL_PATH },
    fetchImpl,
  );
}

export async function signInWithEmail(
  input: { email: string; password: string },
  fetchImpl?: FetchLike,
): Promise<void> {
  await post("/sign-in/email", { ...input, rememberMe: true }, fetchImpl);
}

export async function signOut(fetchImpl?: FetchLike): Promise<void> {
  await post("/sign-out", {}, fetchImpl);
}

/** Answers the same whether or not the address has an account. */
export async function requestPasswordReset(
  email: string,
  fetchImpl?: FetchLike,
): Promise<void> {
  await post(
    "/request-password-reset",
    { email, redirectTo: RESET_PASSWORD_PATH },
    fetchImpl,
  );
}

export async function resetPassword(
  input: { token: string; newPassword: string },
  fetchImpl?: FetchLike,
): Promise<void> {
  await post("/reset-password", input, fetchImpl);
}

/** Changes the password and signs out every other session. */
export async function changePassword(
  input: { currentPassword: string; newPassword: string },
  fetchImpl?: FetchLike,
): Promise<void> {
  await post("/change-password", { ...input, revokeOtherSessions: true }, fetchImpl);
}

export async function resendVerificationEmail(
  email: string,
  fetchImpl?: FetchLike,
): Promise<void> {
  await post(
    "/send-verification-email",
    { email, callbackURL: VERIFY_EMAIL_PATH },
    fetchImpl,
  );
}

/**
 * Starts Google's redirect flow (docs/specs/06-auth.md §1) and returns the
 * address to send the browser to. `next` is where to land afterwards.
 */
export async function googleSignInUrl(
  next: string,
  fetchImpl?: FetchLike,
): Promise<string> {
  const json = await post(
    "/sign-in/social",
    { provider: "google", callbackURL: next, errorCallbackURL: "/login" },
    fetchImpl,
  );
  const parsed = redirectSchema.safeParse(json);
  if (!parsed.success) throw new AuthRequestError(authProblem(500, null, null));
  return parsed.data.url;
}
