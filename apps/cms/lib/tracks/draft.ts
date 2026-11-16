import { trackInputSchema, type AdminTrack, type TrackInput } from "@repo/shared";

/** A track as the editor holds it: saved ones, and new ones that have no origin yet. */
export interface TrackDraft {
  /** Stable key for the editor's list, whatever the track's id is changed to. */
  key: string;
  id: string;
  title: string;
  summary: string;
  paperIds: string[];
  origin: AdminTrack["origin"] | null;
}

export function toDrafts(tracks: readonly AdminTrack[]): TrackDraft[] {
  return tracks.map((track) => ({ ...track, key: track.id }));
}

export function newDraft(key: string): TrackDraft {
  return { key, id: "", title: "", summary: "", paperIds: [], origin: null };
}

/** The request body's tracks: what is saved, without the editor's own fields. */
export function toRequest(drafts: readonly TrackDraft[]): TrackInput[] {
  return drafts.map(({ id, title, summary, paperIds }) => ({
    id: id.trim(),
    title: title.trim(),
    summary: summary.trim(),
    paperIds: [...paperIds],
  }));
}

/** A readable id for a new track: lowercase words joined by hyphens. */
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Whether the drafts differ from what was loaded. */
export function isDirty(
  drafts: readonly TrackDraft[],
  saved: readonly AdminTrack[],
): boolean {
  return JSON.stringify(toRequest(drafts)) !== JSON.stringify(toRequest(toDrafts(saved)));
}

/** What is wrong with each draft, by its key, in words; empty when it can be saved. */
export function trackProblems(drafts: readonly TrackDraft[]): Map<string, string[]> {
  const problems = new Map<string, string[]>();
  const request = toRequest(drafts);
  const seen = new Set<string>();
  drafts.forEach((draft, index) => {
    const found: string[] = [];
    const parsed = trackInputSchema.safeParse(request[index]);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "id")
          found.push("Use a short id of lowercase letters, digits and hyphens.");
        else if (field === "title")
          found.push("Give the track a title of up to 120 characters.");
        else if (field === "summary")
          found.push("Add a summary of up to 300 characters.");
        else if (field === "paperIds")
          found.push(
            issue.code === "custom"
              ? "List each paper once."
              : "Add between 1 and 30 papers.",
          );
      }
    }
    const id = request[index]?.id ?? "";
    if (id !== "" && seen.has(id)) found.push("Another track already has this id.");
    seen.add(id);
    if (found.length > 0) problems.set(draft.key, [...new Set(found)]);
  });
  return problems;
}
