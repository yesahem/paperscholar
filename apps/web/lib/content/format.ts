/** "Vaswani, Shazeer and 6 others"; every name when there are three or fewer. */
export function formatAuthors(authors: string[], shown = 2): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length <= shown + 1) {
    return authors.length === 1
      ? (authors[0] ?? "")
      : `${authors.slice(0, -1).join(", ")} and ${authors.at(-1) ?? ""}`;
  }
  const others = authors.length - shown;
  return `${authors.slice(0, shown).join(", ")} and ${others} others`;
}

/** "3 problems", "1 problem". */
export function pluralise(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** "deep-learning" → "deep learning". */
export function formatTag(tag: string): string {
  return tag.replace(/-/g, " ");
}
