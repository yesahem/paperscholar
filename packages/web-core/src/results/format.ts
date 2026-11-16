/** "test_output_has_shape" → "output has shape" (docs/specs/08-web.md §5.5). */
export function humaniseTestName(name: string): string {
  return name
    .replace(/^test_/, "")
    .replace(/_+/g, " ")
    .trim();
}

/** "1.2 s", "340 ms"; empty when the duration is unknown. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
