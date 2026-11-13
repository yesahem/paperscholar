/** Object keys of the content layout (docs/specs/03-content.md §2.1). */

export const CONTENT_INDEX_KEY = "content/index.json";
export const TRACKS_KEY = "content/tracks.json";

export type DocumentPart = "public" | "private";

export function paperVersionKey(
  paperId: string,
  version: number,
  part: DocumentPart,
): string {
  return `content/papers/${paperId}/v${version}/${part}.json`;
}

/** `content/index-history/20261113T151230123Z-1a2b3c4d.json` */
export function indexHistoryKey(at: Date, nonce: string): string {
  const stamp = at.toISOString().replace(/[-:.]/g, "");
  return `content/index-history/${stamp}-${nonce}.json`;
}
