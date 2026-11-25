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

/** `content/papers/<paperId>/draft/<part>.json`: an unpublished draft (docs/specs/03-content.md §2.1). */
export function paperDraftKey(paperId: string, part: DocumentPart): string {
  return `content/papers/${paperId}/draft/${part}.json`;
}

/** `content/index-history/20261113T151230123Z-1a2b3c4d.json` */
export function indexHistoryKey(at: Date, nonce: string): string {
  const stamp = at.toISOString().replace(/[-:.]/g, "");
  return `content/index-history/${stamp}-${nonce}.json`;
}

/** `content/exams/index.json`: the quiz topics (docs/specs/03-content.md §2.1). */
export const EXAM_INDEX_KEY = "content/exams/index.json";

/** `content/exams/<topicId>/<part>.json` */
export function examKey(topicId: string, part: DocumentPart): string {
  return `content/exams/${topicId}/${part}.json`;
}

/** `content/courses/index.json`: the courses (docs/specs/03-content.md §2.1). */
export const COURSE_INDEX_KEY = "content/courses/index.json";

/** `content/courses/<courseId>/<part>.json` */
export function courseKey(courseId: string, part: DocumentPart): string {
  return `content/courses/${courseId}/${part}.json`;
}

/** Where a lecture's video lives: `video/<videoKey>` in the private bucket. */
export function videoObjectKey(videoKey: string): string {
  return `video/${videoKey}`;
}
