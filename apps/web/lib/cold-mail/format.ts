import type {
  ColdMailStatus,
  ColdMailTargetType,
  ColdMailTone,
} from "@repo/shared/cold-mail";

/** Wording for the cold-mail page (docs/specs/10-secondary-features.md §6). */

export const STATUS_LABEL: Record<ColdMailStatus, string> = {
  pending: "Writing",
  done: "Ready",
  failed: "Not written",
};

export const TARGET_TYPE_LABEL: Record<ColdMailTargetType, string> = {
  professor: "A professor or researcher",
  company: "A company",
};

export const TONE_LABEL: Record<ColdMailTone, string> = {
  formal: "Formal",
  friendly: "Friendly",
};

/**
 * A `mailto:` link that opens the draft in the user's own email program, with
 * no recipient filled in. The site itself never sends email.
 */
export function mailtoHref(subject: string, body: string): string {
  const query = new URLSearchParams({ subject, body }).toString().replaceAll("+", "%20");
  return `mailto:?${query}`;
}
