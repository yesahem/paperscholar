// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";

/**
 * Editor drafts, kept in the browser only (docs/specs/08-web.md §5.3). Every
 * storage access is guarded: private windows and blocked storage throw, and
 * the workspace must keep working without drafts.
 */

/** Delay between the last keystroke and saving. */
export const DRAFT_SAVE_DELAY_MS = 500;

export const draftSchema = z.object({
  code: z.string(),
  /** Hash of the starter the draft began from, to notice a changed starter. */
  starterHash: z.string(),
  updatedAt: z.string(),
});
export type Draft = z.infer<typeof draftSchema>;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function draftKey(paperId: string, problemId: string): string {
  return `draft:v1:${paperId}/${problemId}`;
}

/** FNV-1a, 32-bit. Detects a changed starter; not a security measure. */
export function hashStarter(starter: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < starter.length; index += 1) {
    hash ^= starter.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The browser's localStorage, or null where it is unavailable. */
export function browserDraftStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readDraft(storage: DraftStorage | null, key: string): Draft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Returns false when the draft could not be saved, e.g. storage is full. */
export function writeDraft(
  storage: DraftStorage | null,
  key: string,
  draft: Draft,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(storage: DraftStorage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to do: without storage there is no draft to remove.
  }
}

export interface InitialCode {
  code: string;
  /** A draft exists but was written against a different starter. */
  starterChanged: boolean;
}

/** A saved draft wins over the starter; a draft equal to the starter is no draft. */
export function initialCode(draft: Draft | null, starter: string): InitialCode {
  if (!draft) return { code: starter, starterChanged: false };
  return {
    code: draft.code,
    starterChanged: draft.starterHash !== hashStarter(starter) && draft.code !== starter,
  };
}
