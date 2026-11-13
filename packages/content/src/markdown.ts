export interface RawHtmlMatch {
  line: number;
  html: string;
}

/** Replaces everything except newlines, so line numbers survive masking. */
const blank = (text: string) => text.replace(/[^\n]/g, " ");

/**
 * Finds raw HTML in markdown, which content may not contain
 * (docs/specs/03-content.md §5). Code blocks, inline code and maths are
 * ignored, so `$i < n$` or `<T>` inside code are not flagged.
 */
export function findRawHtml(markdown: string): RawHtmlMatch[] {
  const masked = markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank)
    .replace(/\$\$[\s\S]*?\$\$/g, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/\$[^$\n]+\$/g, blank);

  const matches: RawHtmlMatch[] = [];
  const pattern = /<!--|<\/?[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?\/?>/g;
  for (const match of masked.matchAll(pattern)) {
    const index = match.index ?? 0;
    matches.push({
      line: masked.slice(0, index).split("\n").length,
      html: markdown.slice(index, index + match[0].length),
    });
  }
  return matches;
}
