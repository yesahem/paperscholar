import { USERNAME_MAX_LENGTH, usernameProblem } from "@repo/shared";

/** Longest base kept from an email, leaving room for a numeric suffix. */
const BASE_MAX_LENGTH = 15;
/** Sequential suffixes tried before falling back to random ones. */
const SEQUENTIAL_ATTEMPTS = 50;

/**
 * A username derived from an email's local part: lowercased, anything but
 * letters, digits and underscores turned into underscores, and shortened.
 * Used for Google sign-ups, which do not ask for one (docs/specs/06-auth.md §3).
 */
export function usernameBase(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, BASE_MAX_LENGTH)
    .replace(/_+$/g, "");
  if (cleaned === "") return "learner";
  return cleaned.length < 3 ? `${cleaned}_learner` : cleaned;
}

function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`;
}

/**
 * The first free, valid username for `email`: its base, then the base with
 * 2, 3, … appended, then random digits.
 */
export async function generateUsername(
  email: string,
  isTaken: (username: string) => Promise<boolean>,
  random: () => number = Math.random,
): Promise<string> {
  const base = usernameBase(email);
  const usable = async (candidate: string) =>
    usernameProblem(candidate) === null && !(await isTaken(candidate));

  if (await usable(base)) return base;
  for (let suffix = 2; suffix < SEQUENTIAL_ATTEMPTS + 2; suffix += 1) {
    const candidate = withSuffix(base, String(suffix));
    if (await usable(candidate)) return candidate;
  }
  for (;;) {
    const candidate = withSuffix(base, String(Math.floor(random() * 1_000_000)));
    if (await usable(candidate)) return candidate;
  }
}
