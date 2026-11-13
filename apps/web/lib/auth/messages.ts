/**
 * What to tell the user when an auth request fails. Better Auth answers with
 * its own `{ code, message }` body; these turn its codes into plain sentences
 * and point at the form field to fix.
 */

export type AuthField = "email" | "password" | "username";

export interface AuthProblem {
  message: string;
  /** The field the message is about, when there is one. */
  field: AuthField | null;
}

const WRONG_CREDENTIALS: AuthProblem = {
  message: "That email and password do not match an account.",
  field: null,
};

const BY_CODE: Record<string, AuthProblem> = {
  INVALID_EMAIL_OR_PASSWORD: WRONG_CREDENTIALS,
  INVALID_EMAIL: { message: "Enter a valid email address.", field: "email" },
  USER_ALREADY_EXISTS: {
    message: "An account with this email already exists. Sign in instead.",
    field: "email",
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    message: "An account with this email already exists. Sign in instead.",
    field: "email",
  },
  USERNAME_IS_ALREADY_TAKEN: { message: "That username is taken.", field: "username" },
  USERNAME_TOO_SHORT: { message: "Use at least 3 characters.", field: "username" },
  USERNAME_TOO_LONG: { message: "Use at most 20 characters.", field: "username" },
  INVALID_USERNAME: {
    message: "Use 3–20 letters, digits or underscores, and not a reserved name.",
    field: "username",
  },
  PASSWORD_TOO_SHORT: { message: "Use at least 8 characters.", field: "password" },
  PASSWORD_TOO_LONG: { message: "Use at most 128 characters.", field: "password" },
  INVALID_TOKEN: {
    message: "This link has expired or was already used. Ask for a new one.",
    field: null,
  },
  TOKEN_EXPIRED: {
    message: "This link has expired. Ask for a new one.",
    field: null,
  },
  EMAIL_ALREADY_VERIFIED: { message: "Your email is already confirmed.", field: null },
};

/** "a minute", "3 minutes" */
function minutes(seconds: number): string {
  const count = Math.max(1, Math.ceil(seconds / 60));
  return count === 1 ? "a minute" : `${count} minutes`;
}

export function authProblem(
  status: number | null,
  code: string | null,
  retryAfterSeconds: number | null,
): AuthProblem {
  if (status === null) {
    return { message: "Could not reach the server. Check your connection.", field: null };
  }
  if (status === 429) {
    return {
      message: retryAfterSeconds
        ? `Too many attempts. Try again in ${minutes(retryAfterSeconds)}.`
        : "Too many attempts. Try again later.",
      field: null,
    };
  }
  if (code && BY_CODE[code]) return BY_CODE[code];
  if (status === 401) return WRONG_CREDENTIALS;
  if (status === 403) {
    return {
      message: "This request was refused. Reload the page and try again.",
      field: null,
    };
  }
  return { message: "Something went wrong on our side. Try again.", field: null };
}
